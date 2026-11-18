from backend.timeutils import utcnow

"""API and compiled React frontend, served from the same origin."""
import io
import logging
from datetime import date, datetime, time
from uuid import UUID
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import (
    FileResponse,
    JSONResponse,
    RedirectResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from openpyxl import Workbook
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from backend.config import ROOT, get_settings
from backend.database import make_engine, session_factory
from backend.models import APPLICATION_STATUSES, Application, Job, StatusHistory
from backend.schemas import (
    ApplicationInput,
    ApplicationPatch,
    JobInput,
    JobOut,
    LoginInput,
    Status,
)
from backend.security import COOKIE, current_session, login, require_owner

logger = logging.getLogger(__name__)


def create_app(settings=None, engine=None):
    app = FastAPI(title="Job Automation System", version="1.0.0")
    app.state.settings = settings or get_settings()
    app.state.engine = engine or make_engine(app.state.settings.database_url)
    app.state.sessions = session_factory(app.state.engine)

    def db_session():
        with app.state.sessions() as db:
            yield db

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        if request.url.path.startswith("/app"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse(
            status_code=422,
            content={
                "detail": "; ".join(
                    ".".join(str(p) for p in e["loc"][1:]) + ": " + e["msg"]
                    for e in error.errors()
                )
            },
        )

    @app.exception_handler(IntegrityError)
    async def conflict(request, error):
        return JSONResponse(
            status_code=409,
            content={
                "detail": "This posting or application already exists, or references an unavailable record."
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_failure(request, error):
        logger.error("Database operation failed (%s)", type(error).__name__)
        return JSONResponse(
            status_code=503,
            content={
                "detail": "The database is temporarily unavailable. Please try again."
            },
        )

    def find_job(db, job_id):
        job = db.scalar(select(Job).where(Job.id == job_id, Job.is_demo.is_(True)))
        if not job:
            raise HTTPException(404, "Job not found")
        return job

    def app_query():
        return (
            select(Application)
            .join(Job)
            .where(
                Application.user_id == app.state.settings.demo_user_id,
                Job.is_demo.is_(True),
            )
        )

    def find_application(db, application_id, lock=False):
        query = app_query().where(Application.id == application_id)
        if lock:
            query = query.with_for_update(of=Application)
        application = db.scalar(query)
        if not application:
            raise HTTPException(404, "Application not found")
        return application

    def job_dict(job):
        return JobOut.model_validate(job).model_dump(mode="json")

    def application_dict(application, job):
        return {
            "id": str(application.id),
            "job_id": str(application.job_id),
            "status": application.status,
            "notes": application.notes,
            "applied_at": application.applied_at,
            "created_at": application.created_at,
            "updated_at": application.updated_at,
            "job": job_dict(job),
        }

    def filter_jobs(query, q="", company="", role="", platform="", location=""):
        if q:
            query = query.where(
                or_(
                    *(
                        col.icontains(q, autoescape=True)
                        for col in (Job.title, Job.company, Job.location)
                    )
                )
            )
        for column, value in (
            (Job.company, company),
            (Job.title, role),
            (Job.platform, platform),
            (Job.location, location),
        ):
            if value:
                query = query.where(column.icontains(value, autoescape=True))
        return query

    def apply_filters(
        q: str = Query("", max_length=255),
        company: str = Query("", max_length=255),
        role: str = Query("", max_length=255),
        platform: str = Query("", max_length=100),
        location: str = Query("", max_length=255),
        status: Status | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ):
        if date_from and date_to and date_from > date_to:
            raise HTTPException(422, "Start date must be on or before end date.")
        query = filter_jobs(app_query(), q, company, role, platform, location)
        if status:
            query = query.where(Application.status == status)
        if date_from:
            query = query.where(
                Application.created_at >= datetime.combine(date_from, time.min)
            )
        if date_to:
            query = query.where(
                Application.created_at <= datetime.combine(date_to, time.max)
            )
        return query

    @app.get("/health/live")
    def live():
        return {"status": "ok"}

    @app.get("/health/ready")
    def ready(db=Depends(db_session)):
        db.execute(text("SELECT 1"))
        db.scalar(select(Job.id).limit(1))
        return {"status": "ok"}

    @app.get("/api/auth/session")
    def session(request: Request, db=Depends(db_session)):
        active = current_session(request, db)
        return {
            "authenticated": bool(active),
            "csrf_token": active.csrf_token if active else None,
        }

    @app.post("/api/auth/login")
    def sign_in(
        payload: LoginInput,
        request: Request,
        response: Response,
        db=Depends(db_session),
    ):
        token, csrf = login(request, db, payload)
        response.set_cookie(
            COOKIE,
            token,
            max_age=app.state.settings.session_hours * 3600,
            httponly=True,
            secure=app.state.settings.secure_cookie,
            samesite="strict",
            path="/",
        )
        return {"authenticated": True, "csrf_token": csrf}

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, response: Response, db=Depends(db_session)):
        db.delete(require_owner(request, db))
        db.commit()
        response.delete_cookie(
            COOKIE,
            path="/",
            secure=app.state.settings.secure_cookie,
            httponly=True,
            samesite="strict",
        )

    @app.get("/api/meta")
    def meta():
        return {
            "version": "1.0.0",
            "sample_data": True,
            "application_statuses": APPLICATION_STATUSES,
        }

    @app.get("/jobs", response_model=list[JobOut])
    def legacy_jobs(db=Depends(db_session)):
        return db.scalars(
            select(Job)
            .where(Job.is_demo.is_(True))
            .order_by(Job.discovered_at.desc(), Job.id)
        ).all()

    @app.get("/jobs/{job_id}", response_model=JobOut)
    @app.get("/api/jobs/{job_id}", response_model=JobOut)
    def get_job(job_id: UUID, db=Depends(db_session)):
        return find_job(db, job_id)

    @app.get("/api/jobs")
    def jobs(
        q: str = Query("", max_length=255),
        company: str = Query("", max_length=255),
        role: str = Query("", max_length=255),
        platform: str = Query("", max_length=100),
        location: str = Query("", max_length=255),
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
        db=Depends(db_session),
    ):
        query = filter_jobs(
            select(Job).where(Job.is_demo.is_(True)),
            q,
            company,
            role,
            platform,
            location,
        )
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.scalars(
            query.order_by(Job.discovered_at.desc(), Job.id).limit(limit).offset(offset)
        ).all()
        return {
            "items": [job_dict(j) for j in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @app.post("/api/jobs", status_code=201, response_model=JobOut)
    def create_job(payload: JobInput, request: Request, db=Depends(db_session)):
        require_owner(request, db)
        job = Job(**payload.model_dump(), is_demo=True)
        db.add(job)
        db.commit()
        return job

    @app.put("/api/jobs/{job_id}", response_model=JobOut)
    def edit_job(
        job_id: UUID, payload: JobInput, request: Request, db=Depends(db_session)
    ):
        require_owner(request, db)
        job = find_job(db, job_id)
        for name, value in payload.model_dump().items():
            setattr(job, name, value)
        db.commit()
        return job

    @app.get("/api/applications")
    def applications(
        query=Depends(apply_filters),
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
        db=Depends(db_session),
    ):
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.execute(
            query.add_columns(Job)
            .order_by(Application.created_at.desc(), Application.id)
            .limit(limit)
            .offset(offset)
        ).all()
        return {
            "items": [application_dict(a, j) for a, j in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @app.get("/api/applications/export")
    def export(query=Depends(apply_filters), db=Depends(db_session)):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Applications"
        sheet.append(
            [
                "Company",
                "Role",
                "Platform",
                "Location",
                "Job URL",
                "Date Applied (UTC)",
                "Status",
                "Notes",
            ]
        )
        rows = db.execute(
            query.add_columns(Job).order_by(
                Application.created_at.desc(), Application.id
            )
        ).all()
        for application, job in rows:
            sheet.append(
                [
                    job.company,
                    job.title,
                    job.platform,
                    job.location or "",
                    job.job_url,
                    application.applied_at.isoformat()
                    if application.applied_at
                    else "",
                    application.status,
                    application.notes or "",
                ]
            )
            for cell in sheet[sheet.max_row]:
                cell.data_type = "s"
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for col in "ABCDEFGH":
            sheet.column_dimensions[col].width = 26 if col != "H" else 60
        stream = io.BytesIO()
        workbook.save(stream)
        stream.seek(0)
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": 'attachment; filename="job-applications.xlsx"'
            },
        )

    @app.get("/api/applications/{application_id}")
    def get_application(application_id: UUID, db=Depends(db_session)):
        application = find_application(db, application_id)
        return application_dict(application, db.get(Job, application.job_id))

    @app.get("/api/applications/{application_id}/history")
    def history(application_id: UUID, db=Depends(db_session)):
        find_application(db, application_id)
        entries = db.scalars(
            select(StatusHistory)
            .where(StatusHistory.application_id == application_id)
            .order_by(StatusHistory.changed_at, StatusHistory.id)
        ).all()
        return [
            {
                "id": str(e.id),
                "previous_status": e.previous_status,
                "status": e.status,
                "changed_at": e.changed_at,
            }
            for e in entries
        ]

    @app.post("/api/applications", status_code=201)
    def create_application(
        payload: ApplicationInput, request: Request, db=Depends(db_session)
    ):
        require_owner(request, db)
        job = find_job(db, payload.job_id)
        values = payload.model_dump()
        if values["status"] == "applied" and not values["applied_at"]:
            values["applied_at"] = utcnow()
        application = Application(**values, user_id=app.state.settings.demo_user_id)
        db.add(application)
        db.flush()
        db.add(StatusHistory(application_id=application.id, status=application.status))
        db.commit()
        return application_dict(application, job)

    @app.patch("/api/applications/{application_id}")
    def edit_application(
        application_id: UUID,
        payload: ApplicationPatch,
        request: Request,
        db=Depends(db_session),
    ):
        require_owner(request, db)
        application = find_application(db, application_id, lock=True)
        previous = application.status
        for name, value in payload.model_dump(exclude_unset=True).items():
            setattr(application, name, value)
        now = utcnow()
        if application.status == "applied" and not application.applied_at:
            application.applied_at = now
        application.updated_at = now
        if application.status != previous:
            db.add(
                StatusHistory(
                    application_id=application.id,
                    previous_status=previous,
                    status=application.status,
                    changed_at=now,
                )
            )
        db.commit()
        return application_dict(application, db.get(Job, application.job_id))

    @app.get("/api/statistics")
    def statistics(query=Depends(apply_filters), db=Depends(db_session)):
        rows = db.scalars(query).all()
        counts = {status: 0 for status in APPLICATION_STATUSES}
        for row in rows:
            if row.status in counts:
                counts[row.status] += 1
        return {
            "total": len(rows),
            "by_status": counts,
            "jobs": db.scalar(
                select(func.count()).select_from(Job).where(Job.is_demo.is_(True))
            ),
        }

    dist = ROOT / "frontend" / "dist"
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse("/app")

    @app.get("/app", include_in_schema=False)
    @app.get("/app/{path:path}", include_in_schema=False)
    def frontend(path: str = ""):
        if (dist / "index.html").is_file():
            return FileResponse(dist / "index.html")
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Frontend is not built. Run npm ci and npm run build in frontend/."
            },
        )

    return app

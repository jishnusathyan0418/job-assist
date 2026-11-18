"""API and compiled React frontend, served from the same origin."""

from backend.timeutils import utcnow
import io
import logging
from datetime import date, datetime, time
from uuid import UUID
from fastapi import Depends, FastAPI, HTTPException, Query, Request
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
    Status,
)
from backend import accounts, discovery
from backend.models import UserJob
from backend.job_catalog import JobCatalog
from backend.role_relevance import profile_fingerprint
from backend.product_routes import attach_routes, latest_resume

logger = logging.getLogger(__name__)


def create_app(settings=None, engine=None):
    app = FastAPI(title="Job Automation System", version="0.1.0")
    app.state.settings = settings or get_settings()
    app.state.engine = engine or make_engine(app.state.settings.database_url)
    app.state.sessions = session_factory(app.state.engine)

    app.state.catalog = JobCatalog(app.state.sessions)
    app.state.discover = app.state.catalog.discover
    app.state.check_posting = discovery.check_posting

    def db_session(request: Request):
        with app.state.sessions() as db:
            if (
                not request.url.path.startswith(("/api/auth/", "/health/"))
                and request.url.path != "/api/meta"
            ):
                db.info["user"] = accounts.require_user(
                    request, db, write=request.method not in ("GET", "HEAD", "OPTIONS")
                )
            yield db

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith(("/api", "/jobs", "/app")):
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
        job = db.scalar(
            select(Job)
            .join(UserJob)
            .where(
                Job.id == job_id,
                UserJob.user_id == db.info["user"].id,
                Job.is_demo.is_(False),
            )
        )
        if not job:
            raise HTTPException(404, "Job not found")
        return job

    def app_query(db):
        return (
            select(Application)
            .join(Job)
            .where(
                Application.user_id == db.info["user"].id,
                Job.is_demo.is_(False),
            )
        )

    def find_application(db, application_id, lock=False):
        query = app_query(db).where(Application.id == application_id)
        if lock:
            query = query.with_for_update(of=Application)
        application = db.scalar(query)
        if not application:
            raise HTTPException(404, "Application not found")
        return application

    def job_dict(job, db=None):
        result = JobOut.model_validate(job).model_dump(mode="json")
        # Legacy analysis blobs are not part of the real-user API.
        result.pop("description_structured", None)
        result.update(
            source_kind=job.source_kind,
            last_verified_at=job.last_verified_at,
            editable=job.owner_id is not None,
        )
        if db is not None:
            membership = db.get(UserJob, (db.info["user"].id, job.id))
            if "current_match_fingerprint" not in db.info:
                profile = latest_resume(db, db.info["user"].id)
                db.info["current_match_fingerprint"] = (
                    profile_fingerprint(profile)
                    if profile and profile.search_preferences
                    else None
                )
            details = membership.match_details if membership else {}
            result["match_is_current"] = bool(
                details
                and details.get("matching_version") == 9
                and details.get("profile_fingerprint")
                == db.info["current_match_fingerprint"]
            )

            result.update(
                match_details=membership.match_details if membership else {},
                match_score=membership.match_score if membership else 0,
            )
        return result

    def application_dict(application, job):
        return {
            "id": str(application.id),
            "job_id": str(application.job_id),
            "status": application.status,
            "notes": application.notes,
            "resume_version_id": str(application.resume_version_id)
            if application.resume_version_id
            else None,
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
        db=Depends(db_session),
    ):
        if date_from and date_to and date_from > date_to:
            raise HTTPException(422, "Start date must be on or before end date.")
        query = filter_jobs(app_query(db), q, company, role, platform, location)
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

    @app.get("/api/meta")
    def meta():
        return {
            "version": "0.1.0",
            "sample_data": False,
            "application_statuses": APPLICATION_STATUSES,
        }

    @app.get("/jobs")
    def legacy_jobs(db=Depends(db_session)):
        rows = db.scalars(
            select(Job)
            .join(UserJob)
            .where(UserJob.user_id == db.info["user"].id, Job.is_demo.is_(False))
            .order_by(Job.discovered_at.desc(), Job.id)
        ).all()

        return [job_dict(job, db) for job in rows]

    @app.get("/jobs/{job_id}")
    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: UUID, db=Depends(db_session)):
        return job_dict(find_job(db, job_id), db)

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
            select(Job)
            .join(UserJob)
            .where(UserJob.user_id == db.info["user"].id, Job.is_demo.is_(False)),
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
            "items": [job_dict(j, db) for j in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @app.post("/api/jobs", status_code=201)
    def create_job(payload: JobInput, request: Request, db=Depends(db_session)):
        job = Job(**payload.model_dump(), is_demo=False, owner_id=db.info["user"].id)
        db.add(job)
        db.flush()
        db.add(UserJob(user_id=db.info["user"].id, job_id=job.id))
        db.commit()
        return job_dict(job, db)

    @app.put("/api/jobs/{job_id}")
    def edit_job(
        job_id: UUID, payload: JobInput, request: Request, db=Depends(db_session)
    ):
        job = find_job(db, job_id)
        if job.owner_id != db.info["user"].id:
            raise HTTPException(
                403, "Live job details come from the employer and cannot be edited."
            )
        for name, value in payload.model_dump().items():
            setattr(job, name, value)
        db.commit()
        return job_dict(job, db)

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
        job = find_job(db, payload.job_id)
        values = payload.model_dump()
        if values["status"] == "applied" and not values["applied_at"]:
            values["applied_at"] = utcnow()
        resume = latest_resume(db, db.info["user"].id)
        application = Application(
            **values,
            user_id=db.info["user"].id,
            resume_version_id=resume.id if resume and resume.confirmed_at else None,
        )
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
                select(func.count())
                .select_from(UserJob)
                .where(UserJob.user_id == db.info["user"].id)
            ),
        }

    attach_routes(
        app, db_session, find_job, find_application, job_dict, application_dict
    )

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

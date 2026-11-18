import secrets
from datetime import timedelta
from pathlib import PurePath
from urllib.parse import quote
from uuid import UUID
from fastapi import BackgroundTasks, Depends, HTTPException, Request, Response, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select, func, delete, text
from sqlalchemy.dialects.postgresql import insert
from backend import accounts, discovery
from backend.models import (
    User,
    Resume,
    UserJob,
    Job,
    Application,
    StatusHistory,
    UserSession,
)
from backend.product_schemas import (
    RegisterInput,
    RecoverInput,
    ProfileInput,
    DiscoveryInput,
    ConfirmApplication,
    TailorResumeInput,
)
from backend.schemas import LoginInput
from backend.resume_parser import MAX_BYTES, extract_isolated, suggest
from backend.timeutils import utcnow
from backend.role_relevance import profile_fingerprint
from backend.resume_tailoring import generate, TailoringProviderError


def latest_resume(db, user_id):
    return db.scalar(
        select(Resume)
        .where(Resume.user_id == user_id)
        .order_by(Resume.created_at.desc(), Resume.id)
        .limit(1)
    )


def resume_dict(resume):
    if not resume:
        return None
    return {
        "profile_fingerprint": profile_fingerprint(resume),
        **{
            key: getattr(resume, key)
            for key in [
                "id",
                "filename",
                "extracted_text",
                "skills",
                "preferred_roles",
                "experience",
                "search_preferences",
                "location",
                "country",
                "confirmed_at",
                "created_at",
            ]
        },
    }


def attach_routes(
    app, db_session, find_job, find_application, job_dict, application_dict
):
    def ip(request):
        return request.client.host if request.client else "unknown"

    @app.post("/api/auth/register", status_code=201)
    def register(
        payload: RegisterInput,
        request: Request,
        response: Response,
        db=Depends(db_session),
    ):
        accounts.check_origin(request)
        email = str(payload.email).lower()
        accounts.rate_limit(db, "register", email, ip(request))
        if db.scalar(select(User.id).where(func.lower(User.email) == email)):
            raise HTTPException(
                409,
                "An account with this email already exists. Sign in or use your recovery code.",
            )
        code = secrets.token_urlsafe(24)
        user = User(
            email=email,
            full_name=payload.full_name,
            password_hash=accounts.hash_password(payload.password),
            recovery_hash=accounts.digest(code),
        )
        db.add(user)
        db.flush()
        result = accounts.issue_session(request, response, db, user)
        result["recovery_code"] = code
        return result

    @app.post("/api/auth/login")
    def login(
        payload: LoginInput,
        request: Request,
        response: Response,
        db=Depends(db_session),
    ):
        accounts.check_origin(request)
        email = payload.email.strip().lower()
        accounts.rate_limit(db, "login", email, ip(request))
        user = db.scalar(select(User).where(func.lower(User.email) == email))
        if not accounts.verify(user.password_hash if user else None, payload.password):
            raise HTTPException(
                401,
                "Email or password is incorrect. New here? Create your personal account first.",
            )
        return accounts.issue_session(request, response, db, user)

    @app.get("/api/auth/session")
    def session(request: Request, db=Depends(db_session)):
        active = accounts.current_session(request, db)
        user = db.get(User, active.user_id) if active else None
        if not user or not user.password_hash:
            return {"authenticated": False, "csrf_token": None, "user": None}
        return {
            "authenticated": True,
            "csrf_token": active.csrf_token,
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
            },
        }

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, response: Response, db=Depends(db_session)):
        accounts.require_user(request, db, write=True)
        db.delete(accounts.current_session(request, db))
        db.commit()
        response.delete_cookie(
            accounts.COOKIE,
            path="/",
            secure=app.state.settings.secure_cookie,
            httponly=True,
            samesite="strict",
        )

    @app.post("/api/auth/recover")
    def recover(payload: RecoverInput, request: Request, db=Depends(db_session)):
        accounts.check_origin(request)
        email = str(payload.email).lower()
        accounts.rate_limit(db, "recover", email, ip(request))
        user = db.scalar(
            select(User).where(func.lower(User.email) == email).with_for_update()
        )
        if (
            not user
            or not user.password_hash
            or not secrets.compare_digest(
                user.recovery_hash or "", accounts.digest(payload.recovery_code.strip())
            )
        ):
            raise HTTPException(401, "Email or recovery code is incorrect.")
        code = secrets.token_urlsafe(24)
        user.password_hash = accounts.hash_password(payload.new_password)
        user.recovery_hash = accounts.digest(code)
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))
        db.commit()
        return {
            "recovery_code": code,
            "message": "Password updated. Save the replacement recovery code, then sign in.",
        }

    @app.get("/api/profile")
    def profile(db=Depends(db_session)):
        return {"resume": resume_dict(latest_resume(db, db.info["user"].id))}

    @app.post("/api/resumes", status_code=201)
    async def upload(
        request: Request,
        filename: str = Query(..., min_length=1, max_length=255),
        db=Depends(db_session),
    ):
        user = db.info["user"]
        if (
            db.scalar(
                select(func.count())
                .select_from(Resume)
                .where(Resume.user_id == user.id)
            )
            >= 10
        ):
            raise HTTPException(
                409,
                "You have 10 resume versions. Delete an unused version before uploading another.",
            )
        chunks = bytearray()
        async for chunk in request.stream():
            chunks.extend(chunk)
            if len(chunks) > MAX_BYTES:
                raise HTTPException(413, "Resume must be smaller than 5 MB.")
        filename = PurePath(filename.replace("\\", "/")).name
        suffix = PurePath(filename).suffix.lower()
        media = {
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".txt": "text/plain",
        }.get(suffix)
        if not media:
            raise HTTPException(422, "Supported formats: PDF, DOCX, and TXT.")
        try:
            extracted = await run_in_threadpool(
                extract_isolated, filename, bytes(chunks)
            )
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
        resume = Resume(
            user_id=user.id,
            filename=filename,
            media_type=media,
            file_data=bytes(chunks),
            extracted_text=extracted,
            **suggest(extracted),
        )
        db.add(resume)
        db.commit()
        return resume_dict(resume)

    @app.put("/api/resumes/{resume_id}/review")
    def review(resume_id: UUID, payload: ProfileInput, db=Depends(db_session)):
        resume = db.scalar(
            select(Resume).where(
                Resume.id == resume_id, Resume.user_id == db.info["user"].id
            )
        )
        if not resume:
            raise HTTPException(404, "Resume not found")
        previous_fingerprint = profile_fingerprint(resume)
        for key, value in payload.model_dump().items():
            setattr(resume, key, value)
        resume.confirmed_at = utcnow()
        if previous_fingerprint != profile_fingerprint(resume):
            # A changed search profile is a new search, not a repeat of the previous request.
            user = db.get(User, resume.user_id)
            user.last_search_at = None
        db.commit()
        return resume_dict(resume)

    @app.get("/api/resumes")
    def resumes(db=Depends(db_session)):
        rows = db.scalars(
            select(Resume)
            .where(Resume.user_id == db.info["user"].id)
            .order_by(Resume.created_at.desc())
        ).all()
        return [
            {
                "id": r.id,
                "filename": r.filename,
                "created_at": r.created_at,
                "confirmed_at": r.confirmed_at,
            }
            for r in rows
        ]

    @app.get("/api/resumes/{resume_id}/download")
    def download(resume_id: UUID, db=Depends(db_session)):
        resume = db.scalar(
            select(Resume).where(
                Resume.id == resume_id, Resume.user_id == db.info["user"].id
            )
        )
        if not resume:
            raise HTTPException(404, "Resume not found")
        return Response(
            resume.file_data,
            media_type=resume.media_type,
            headers={
                "Content-Disposition": "attachment; filename*=UTF-8''"
                + quote(resume.filename, safe="")
            },
        )

    @app.delete("/api/resumes/{resume_id}", status_code=204)
    def delete_resume(resume_id: UUID, db=Depends(db_session)):
        resume = db.scalar(
            select(Resume).where(
                Resume.id == resume_id, Resume.user_id == db.info["user"].id
            )
        )
        if not resume:
            raise HTTPException(404, "Resume not found")
        if db.scalar(
            select(Application.id)
            .where(
                Application.user_id == resume.user_id,
                Application.resume_version_id == resume.id,
            )
            .limit(1)
        ):
            raise HTTPException(
                409,
                "This resume is linked to an application and is retained for its history.",
            )
        db.delete(resume)
        db.commit()

    @app.get("/api/discovery/sources")
    def sources(db=Depends(db_session)):
        return discovery.source_options()

    @app.post("/api/discovery/search")
    def search(
        payload: DiscoveryInput,
        background_tasks: BackgroundTasks,
        db=Depends(db_session),
    ):
        user = db.scalar(
            select(User).where(User.id == db.info["user"].id).with_for_update()
        )
        resume = latest_resume(db, user.id)
        if not resume or not resume.confirmed_at or not resume.search_preferences:
            raise HTTPException(
                409,
                "Confirm your resume and search preferences, including career stage and experience, before finding jobs.",
            )
        search_id, search_fingerprint = resume.id, profile_fingerprint(resume)
        if (payload.resume_id is not None and payload.resume_id != search_id) or (
            payload.profile_fingerprint is not None
            and payload.profile_fingerprint != search_fingerprint
        ):
            raise HTTPException(
                409,
                "Your search profile changed. Refresh your profile and search again.",
            )
        search_profile = {
            "resume_id": str(search_id),
            "filename": resume.filename,
            "profile_fingerprint": search_fingerprint,
            "preferred_roles": resume.preferred_roles,
            "skills": resume.skills,
            "location": resume.location,
            "country": resume.country,
            "search_preferences": resume.search_preferences,
        }
        if user.last_search_at and user.last_search_at > utcnow() - timedelta(
            seconds=60
        ):
            raise HTTPException(
                429,
                "Please wait one minute before searching again.",
                headers={"Retry-After": "60"},
            )
        user.last_search_at = utcnow()
        db.commit()
        try:
            items, warnings = app.state.discover(resume, payload.source)
        except discovery.SourceError as error:
            raise HTTPException(503, str(error)) from None
        if (
            payload.source in {"all", "greenhouse", "ashby", "lever"}
            and app.state.discover == app.state.catalog.discover
        ):
            background_tasks.add_task(app.state.catalog.refresh_due, payload.source)
        db.expire_all()
        current = latest_resume(db, user.id)
        if (
            not current
            or current.id != search_id
            or profile_fingerprint(current) != search_fingerprint
        ):
            raise HTTPException(
                409,
                "Your resume changed during the search. Search again with the updated profile.",
            )
        result = []
        # Lock postings in a stable order even when users have different match rankings.
        for item in sorted(items, key=lambda value: value["job_url"]):
            values = {
                k: v
                for k, v in item.items()
                if k not in {"match", "employment_type", "compensation"}
            }
            checked_at = values.pop("last_verified_at", utcnow())
            # A per-post lock prevents duplicate imports when two users search concurrently.
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
                {"key": values["job_url"]},
            )
            job = db.scalar(
                select(Job).where(
                    Job.owner_id.is_(None),
                    Job.job_url == values["job_url"],
                    Job.is_demo.is_(False),
                )
            )
            if not job:
                job = db.scalar(
                    select(Job).where(
                        Job.owner_id.is_(None),
                        Job.platform == values["platform"],
                        Job.platform_job_id == values["platform_job_id"],
                        Job.is_demo.is_(False),
                    )
                )
            if not job:
                job = Job(**values, is_demo=False, last_verified_at=checked_at)
                db.add(job)
                db.flush()
            else:
                for key, value in values.items():
                    setattr(job, key, value)
                job.last_verified_at = checked_at
            match_details = item["match"]
            db.execute(
                insert(UserJob)
                .values(
                    user_id=user.id,
                    job_id=job.id,
                    saved_at=utcnow(),
                    match_score=match_details["score"],
                    match_details=match_details,
                )
                .on_conflict_do_update(
                    index_elements=["user_id", "job_id"],
                    set_={
                        "match_score": match_details["score"],
                        "match_details": match_details,
                    },
                )
            )
            result.append(job)
        db.commit()
        serialized = [job_dict(job, db) for job in result]
        serialized.sort(
            key=lambda job: (
                job["match_details"].get("classification") != "recommended",
                -(job["match_details"].get("rank_score", job["match_score"]) or 0),
            )
        )
        return {
            "diagnostics": getattr(items, "diagnostics", None),
            "search_profile": search_profile,
            "items": serialized,
            "total": len(result),
            "warnings": warnings,
            "source": payload.source,
            "searched_at": utcnow(),
            "coverage": "Selected company boards"
            if payload.source in {"all", "greenhouse", "ashby", "lever"}
            else "Adzuna search results",
        }

    @app.post("/api/jobs/{job_id}/tailor-resume")
    def tailor_resume(
        job_id: UUID,
        payload: TailorResumeInput,
        db=Depends(db_session),
    ):
        job = find_job(db, job_id)
        resume = latest_resume(db, db.info["user"].id)
        if not resume or not resume.confirmed_at:
            raise HTTPException(
                409, "Upload and confirm a resume before preparing tailored materials."
            )
        if not job.description_raw or not job.description_raw.strip():
            raise HTTPException(
                409, "This job has no saved description to compare with your resume."
            )
        if len(resume.extracted_text) > 30000 or len(job.description_raw) > 30000:
            raise HTTPException(
                413,
                "The resume or job description is too long for this request. Shorten it before retrying.",
            )
        job_text = discovery.plain(job.description_raw)
        if not job_text:
            raise HTTPException(
                409, "This job has no readable description to compare with your resume."
            )
        settings = app.state.settings
        if not (
            settings.groq_api_key
            and settings.groq_model
            and settings.groq_zero_data_retention_confirmed
        ):
            raise HTTPException(
                503,
                "Resume preparation is not configured. Set GROQ_API_KEY, GROQ_MODEL, and confirm Groq Zero Data Retention in the server environment.",
            )
        try:
            draft, format_checks = generate(
                api_key=settings.groq_api_key,
                model=settings.groq_model,
                resume_text=resume.extracted_text,
                job_title=job.title,
                company=job.company,
                job_text=job_text,
            )
        except TailoringProviderError as error:
            raise HTTPException(502, str(error)) from None
        return {
            "job_id": str(job.id),
            "resume_id": str(resume.id),
            "resume_filename": resume.filename,
            **draft.model_dump(),
            "format_checks": format_checks,
            "warnings": [
                "This is an AI draft, not a result from the employer's ATS. No ATS score, interview, or selection outcome can be promised.",
                "Review every statement against your original resume before using it. Missing job keywords are not proof that you have those skills.",
                "The resume and job description were sent to Groq for this request. Groq Zero Data Retention must be enabled in your Groq account.",
                "The LaTeX layout is original and single-column; it is not Jake's Resume template source.",
            ],
        }

    @app.post("/api/jobs/{job_id}/start")
    def start(job_id: UUID, db=Depends(db_session)):
        user = db.info["user"]
        job = find_job(db, job_id)
        if job.source_kind in {"greenhouse", "ashby", "lever"}:
            try:
                app.state.check_posting(job)
            except discovery.SourceError as error:
                raise HTTPException(409, str(error)) from None
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
            {"key": f"apply:{user.id}:{job_id}"},
        )
        application = db.scalar(
            select(Application)
            .where(Application.user_id == user.id, Application.job_id == job_id)
            .with_for_update()
        )
        resume = latest_resume(db, user.id)
        if not application:
            membership = db.get(UserJob, (user.id, job.id))
            application = Application(
                user_id=user.id,
                job_id=job.id,
                status="application_started",
                resume_version_id=resume.id if resume and resume.confirmed_at else None,
                match_score=membership.match_score,
                match_details=membership.match_details,
            )
            db.add(application)
            db.flush()
            db.add(
                StatusHistory(
                    application_id=application.id, status="application_started"
                )
            )
        elif application.status in ("discovered", "matched", "ready_for_review"):
            previous = application.status
            application.status = "application_started"
            application.updated_at = utcnow()
            db.add(
                StatusHistory(
                    application_id=application.id,
                    previous_status=previous,
                    status=application.status,
                )
            )
        db.commit()
        return {
            "application": application_dict(application, job),
            "apply_url": job.job_url,
            "message": "Complete the employer form, then return and confirm submission. Opening this link is not proof of submission.",
        }

    @app.post("/api/applications/{application_id}/confirm")
    def confirm(
        application_id: UUID, payload: ConfirmApplication, db=Depends(db_session)
    ):
        if not payload.confirmed:
            raise HTTPException(
                422, "Confirm only after completing the employer application."
            )
        application = find_application(db, application_id, lock=True)
        if application.status == "applied":
            return application_dict(application, db.get(Job, application.job_id))
        if application.status not in (
            "discovered",
            "matched",
            "ready_for_review",
            "application_started",
            "manual_action_required",
        ):
            raise HTTPException(
                409,
                "This application has already progressed. Use Update application to correct its status.",
            )
        previous = application.status
        application.status = "applied"
        application.applied_at = application.applied_at or utcnow()
        application.updated_at = utcnow()
        db.add(
            StatusHistory(
                application_id=application.id,
                previous_status=previous,
                status="applied",
            )
        )
        db.commit()
        return application_dict(application, db.get(Job, application.job_id))

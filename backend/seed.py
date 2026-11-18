from backend.timeutils import utcnow
from datetime import timedelta
from uuid import NAMESPACE_URL, uuid5
from sqlalchemy import select, text
from backend.models import Application, Job, StatusHistory, User

JOBS = [
    ("Orbit Labs", "Junior Python Developer", "Bengaluru, India", "company careers"),
    ("Fern Analytics", "Data Analyst", "Remote", "linkedin"),
    ("Northstar AI", "AI Engineer", "Hyderabad, India", "wellfound"),
    ("Mosaic Cloud", "Backend Developer", "Pune, India", "company careers"),
    ("Sage Systems", "Machine Learning Intern", "Remote", "linkedin"),
    ("Paperplane Studio", "Full Stack Developer", "Chennai, India", "wellfound"),
    ("Harbor Data", "Data Engineer", "Bengaluru, India", "company careers"),
    ("Clover Digital", "Python Developer", "Remote", "linkedin"),
    ("Meridian Works", "Software Engineer", "Mumbai, India", "company careers"),
    ("Ripple Research", "ML Engineer", "Hyderabad, India", "wellfound"),
    ("Cedar Technologies", "Backend Intern", "Remote", "company careers"),
    ("Lumen Software", "Frontend Developer", "Pune, India", "linkedin"),
    ("Atlas Sandbox", "Graduate Engineer", "Bengaluru, India", "company careers"),
    ("Meadow Computing", "API Developer", "Remote", "wellfound"),
    ("Canvas Robotics", "Computer Vision Intern", "Chennai, India", "company careers"),
]
STATUSES = [
    "interview",
    "applied",
    "offer",
    "applied",
    "assessment",
    "ready_for_review",
    "manual_action_required",
    "rejected",
    "application_started",
    "discovered",
]


def seed(db, settings):
    db.execute(text("SELECT pg_advisory_xact_lock(74019232)"))
    user = db.get(User, settings.demo_user_id)
    if user and user.email != "fictional-demo@example.invalid":
        raise RuntimeError(
            "DEMO_USER_ID belongs to an existing user. Choose an unused demo UUID."
        )
    if not user:
        db.add(
            User(
                id=settings.demo_user_id,
                email="fictional-demo@example.invalid",
                full_name="Sample Job Seeker",
                target_role="Python / AI Engineer",
                location_pref="India",
                remote_pref="any",
                experience_level="junior",
            )
        )
        db.flush()
    now = utcnow().replace(microsecond=0)
    for index, (company, title, location, platform) in enumerate(JOBS):
        job_id = uuid5(NAMESPACE_URL, f"job-demo-v1/job/{index}")
        job = db.get(Job, job_id)
        if job and not job.is_demo:
            raise RuntimeError(
                "Seed ID conflicts with a non-demo job. No records were changed."
            )
        if not job:
            job = Job(
                id=job_id,
                platform=platform,
                platform_job_id=f"DEMO-{index + 1:03}",
                company=company,
                title=title,
                location=location,
                job_url=f"https://example.invalid/careers/demo-{index + 1}",
                description_raw=f"Fictional posting for demonstration only.\n\n{company} is looking for a {title} to help build thoughtful software.\n\nWhat you would work on\n• Build and test small, reliable features.\n• Collaborate with a supportive engineering team.\n• Document your work and learn through code reviews.\n\nUseful experience\nPython, SQL, Git, REST APIs, and a willingness to learn.\n\nThis is sample data, not a real opening.",
                discovered_at=now - timedelta(days=index + 1),
                is_demo=True,
            )
            db.add(job)
            db.flush()
        if index < len(STATUSES):
            existing = db.scalar(
                select(Application).where(
                    Application.user_id == settings.demo_user_id,
                    Application.job_id == job_id,
                )
            )
            if existing:
                continue
            created = now - timedelta(days=index + 1)
            status = STATUSES[index]
            application = Application(
                id=uuid5(NAMESPACE_URL, f"job-demo-v1/application/{index}"),
                user_id=settings.demo_user_id,
                job_id=job_id,
                status=status,
                created_at=created,
                updated_at=created + timedelta(hours=3),
                applied_at=created + timedelta(hours=1)
                if status in ("applied", "interview", "offer", "assessment", "rejected")
                else None,
                notes="Fictional application for the public demo. No application was submitted.",
            )
            db.add(application)
            db.flush()
            db.add(
                StatusHistory(
                    application_id=application.id,
                    status="discovered",
                    changed_at=created,
                )
            )
            if status != "discovered":
                db.add(
                    StatusHistory(
                        application_id=application.id,
                        previous_status="discovered",
                        status=status,
                        changed_at=created + timedelta(hours=3),
                    )
                )
    db.commit()

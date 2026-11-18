"""Durable public snapshots with bounded staleness and cross-worker refresh leases."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from sqlalchemy import select, update, or_
from sqlalchemy.dialects.postgresql import insert
from backend.models import JobBoardCache
from backend.timeutils import utcnow
from backend import discovery

FRESH_FOR = timedelta(minutes=15)
MAX_STALE = timedelta(hours=24)


class JobCatalog:
    def __init__(self, sessions, fetch=None, source="greenhouse"):
        self.sessions = sessions
        self.source = source
        configurations = {
            "greenhouse": (discovery.boards, discovery.fetch_board),
            "ashby": (
                lambda: ["ashby:" + b for b in discovery.ashby_boards()],
                lambda board: discovery.fetch_ashby_board(board.removeprefix("ashby:")),
            ),
            "lever": (
                lambda: ["lever:" + b for b in discovery.lever_boards()],
                lambda board: discovery.fetch_lever_board(board.removeprefix("lever:")),
            ),
        }
        self.boards, default_fetch = configurations[source]
        self.fetch = fetch or default_fetch

    def snapshots(self):
        with self.sessions() as db:
            return {
                row.board: row
                for row in db.scalars(
                    select(JobBoardCache).where(JobBoardCache.board.in_(self.boards()))
                )
            }

    def refresh(self, board):
        now = utcnow()
        with self.sessions() as db:
            db.execute(
                insert(JobBoardCache)
                .values(board=board, postings=[])
                .on_conflict_do_nothing(index_elements=["board"])
            )
            claimed = db.execute(
                update(JobBoardCache)
                .where(
                    JobBoardCache.board == board,
                    or_(
                        JobBoardCache.lease_until.is_(None),
                        JobBoardCache.lease_until <= now,
                    ),
                    or_(
                        JobBoardCache.retry_at.is_(None), JobBoardCache.retry_at <= now
                    ),
                    or_(
                        JobBoardCache.fetched_at.is_(None),
                        JobBoardCache.fetched_at <= now - FRESH_FOR,
                    ),
                )
                .values(lease_until=now + timedelta(minutes=3))
                .returning(JobBoardCache.board)
            ).scalar()
            db.commit()
        if not claimed:
            return
        try:
            postings = self.fetch(board)
        except discovery.SourceError as error:
            with self.sessions() as db:
                db.execute(
                    update(JobBoardCache)
                    .where(JobBoardCache.board == board)
                    .values(
                        lease_until=None,
                        retry_at=utcnow() + timedelta(seconds=error.retry_after),
                        last_error=str(error),
                    )
                )
                db.commit()
            return
        with self.sessions() as db:
            db.execute(
                update(JobBoardCache)
                .where(JobBoardCache.board == board)
                .values(
                    postings=postings,
                    fetched_at=utcnow(),
                    lease_until=None,
                    retry_at=None,
                    last_error=None,
                )
            )
            db.commit()

    def refresh_many(self, boards):
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(self.refresh, boards))

    def refresh_due(self, source=None):
        if source == "all":
            for kind in ("greenhouse", "ashby", "lever"):
                JobCatalog(self.sessions, source=kind).refresh_due()
            return
        if source and source != self.source:
            return JobCatalog(self.sessions, source=source).refresh_due()
        self.refresh_many(self.boards())

    def discover(self, profile, source):
        if source == "all":
            postings, warnings, succeeded = [], [], 0
            for kind in ("greenhouse", "ashby", "lever"):
                catalog = (
                    self
                    if kind == self.source
                    else JobCatalog(self.sessions, source=kind)
                )
                if not catalog.boards():
                    continue
                try:
                    rows, notices = catalog.read_postings()
                    postings.extend(rows)
                    warnings.extend(notices)
                    succeeded += 1
                except discovery.SourceError as error:
                    warnings.append(f"{kind}: {error}")
            if not succeeded:
                raise discovery.SourceError(
                    " ".join(warnings) or "No sources configured."
                )
            # Merge before ranking and limiting, so each source competes fairly.
            unique = {}
            for post in postings:
                key = post.get("job_url") or (
                    post.get("platform"),
                    post["platform_job_id"],
                )
                unique.setdefault(key, post)
            return discovery.rank_postings(profile, list(unique.values())), warnings
        if source != self.source:
            if source in {"greenhouse", "ashby", "lever"}:
                return JobCatalog(self.sessions, source=source).discover(
                    profile, source
                )
            return discovery.discover(profile, source)
        postings, warnings = self.read_postings()
        return discovery.rank_postings(profile, postings), warnings

    def read_postings(self):
        snapshots = self.snapshots()
        now = utcnow()
        missing = [
            board
            for board in self.boards()
            if board not in snapshots
            or not snapshots[board].fetched_at
            or snapshots[board].fetched_at < now - MAX_STALE
        ]
        # Cold starts fetch once; usable snapshots return immediately and refresh after the response.
        if missing:
            self.refresh_many(missing)
            snapshots = self.snapshots()
        postings, warnings, usable = [], [], 0
        for board in self.boards():
            row = snapshots.get(board)
            if not row or not row.fetched_at or row.fetched_at < utcnow() - MAX_STALE:
                warnings.append(
                    f"{board}: "
                    + (
                        row.last_error
                        if row and row.last_error
                        else "no recent saved listings available; refresh may be unavailable or already in progress."
                    )
                )
                continue
            usable += 1
            stale = row.fetched_at <= utcnow() - FRESH_FOR
            if stale:
                warnings.append(
                    f"{board}: using saved listings last checked {row.fetched_at.isoformat()} UTC. Refresh runs in the background when the source allows it; search again shortly."
                )
            if row.last_error:
                warnings.append(f"{board}: {row.last_error}")
            for post in row.postings:
                postings.append({**post, "last_verified_at": row.fetched_at})
        if not usable:
            raise discovery.SourceError(
                " ".join(warnings) or "No company job boards are configured."
            )
        return postings, warnings

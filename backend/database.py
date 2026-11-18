from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def make_engine(url):
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"connect_timeout": 5, "options": "-c statement_timeout=10000"},
        hide_parameters=True,
    )


def session_factory(engine):
    return sessionmaker(engine, expire_on_commit=False)

"""Explicit setup commands; never seeds or migrates during ordinary imports."""

import argparse
import getpass
from argon2 import PasswordHasher
from backend.config import get_settings
from backend.database import make_engine, session_factory
from backend.seed import seed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["seed", "hash-password"])
    args = parser.parse_args()
    if args.command == "hash-password":
        password = getpass.getpass("Owner password (at least 12 characters): ")
        if len(password) < 12 or password != getpass.getpass("Repeat password: "):
            raise SystemExit("Passwords must match and contain at least 12 characters.")
        print(PasswordHasher().hash(password))
        return
    settings = get_settings()
    engine = make_engine(settings.database_url)
    with session_factory(engine)() as db:
        seed(db, settings)
    engine.dispose()
    print(
        "Demo seed complete: 15 fictional jobs and 10 initial applications. Existing edits preserved."
    )


if __name__ == "__main__":
    main()

"""Build on a local disk, which also works when the source is on Google Drive."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
BUILD = Path(tempfile.gettempdir()) / "jobspace-v1-frontend"


def prepare():
    BUILD.mkdir(exist_ok=True)
    for name in [
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vite.config.ts",
        "index.html",
        "playwright.config.ts",
    ]:
        source = ROOT / "frontend" / name
        if source.exists():
            shutil.copy2(source, BUILD / name)
    for directory in ["src", "e2e"]:
        target = (BUILD / directory).resolve()
        if BUILD.resolve() not in target.parents:
            raise RuntimeError("Build path escaped temporary workspace")
        if target.exists():
            for previous in target.rglob("*"):
                if (
                    previous.is_file()
                    and not (
                        ROOT / "frontend" / directory / previous.relative_to(target)
                    ).exists()
                ):
                    previous.unlink()
        shutil.copytree(
            ROOT / "frontend" / directory, BUILD / directory, dirs_exist_ok=True
        )


def build():
    prepare()
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise SystemExit("Install Node.js 22 before building the frontend.")
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    subprocess.run(
        [
            npm,
            "ci" if (BUILD / "package-lock.json").exists() else "install",
            "--loglevel",
            "error",
        ],
        cwd=BUILD,
        check=True,
        creationflags=flags,
    )
    subprocess.run([npm, "run", "build"], cwd=BUILD, check=True, creationflags=flags)
    shutil.copy2(BUILD / "package-lock.json", ROOT / "frontend" / "package-lock.json")
    shutil.copytree(BUILD / "dist", ROOT / "frontend" / "dist", dirs_exist_ok=True)
    print(
        "Frontend built into frontend/dist. Generated dependencies stay on the local disk."
    )


if __name__ == "__main__":
    build()

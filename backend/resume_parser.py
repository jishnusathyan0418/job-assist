"""Bounded text extraction and transparent suggestions; no invented resume claims."""

import io
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

SKILLS = [
    "Python",
    "JavaScript",
    "TypeScript",
    "Java",
    "C++",
    "C#",
    "SQL",
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "FastAPI",
    "Django",
    "Flask",
    "React",
    "Angular",
    "Vue",
    "Node.js",
    "Express",
    "HTML",
    "CSS",
    "Git",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "GCP",
    "Linux",
    "REST",
    "GraphQL",
    "PyTorch",
    "TensorFlow",
    "Scikit-learn",
    "Pandas",
    "NumPy",
    "Machine Learning",
    "Deep Learning",
    "NLP",
    "Computer Vision",
    "Data Analysis",
    "Excel",
    "Power BI",
    "Tableau",
    "Spark",
    "Airflow",
    "Kafka",
    "Go",
    "Rust",
    "Ruby",
    "PHP",
    "Swift",
    "Kotlin",
    "Spring",
    ".NET",
    "LangChain",
    "LangGraph",
    "RAG",
    "LLMs",
]
ALIASES = {
    "RAG": ["rag", "retrieval augmented generation", "retrieval-augmented generation"],
    "LLMs": ["llm", "llms", "large language model", "large language models"],
    "Node.js": ["nodejs", "node.js"],
    "REST": ["rest", "restful"],
    "Scikit-learn": ["scikit-learn", "sklearn"],
    "GCP": ["gcp", "google cloud"],
    "AWS": ["aws", "amazon web services"],
    "C#": ["c#", "c sharp"],
}
MAX_BYTES = 5 * 1024 * 1024


def contains(text, phrase):
    return bool(re.search(r"(?<![\w])" + re.escape(phrase) + r"(?![\w])", text, re.I))


def skills_in(text):
    return [
        skill
        for skill in SKILLS
        if any(contains(text, name) for name in ALIASES.get(skill, [skill]))
    ]


def suggest(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    roles = []
    for line in lines[:25]:
        if re.fullmatch(
            r"(skills|technical skills|experience|work experience|education|projects):?",
            line,
            re.I,
        ):
            break
        if len(line) < 90 and re.search(
            r"\b(engineer|developer|analyst|designer|scientist|intern|manager)\b",
            line,
            re.I,
        ):
            if not re.search(
                r"\b(looking|seeking|worked|experience|skills)\b", line, re.I
            ):
                roles.append(line)
    if not roles:
        skills = skills_in(text)
        if "Python" in skills:
            roles = ["Python Developer"]
        elif "React" in skills:
            roles = ["Frontend Developer"]
        elif "SQL" in skills:
            roles = ["Data Analyst"]
    experience = []
    capture = False
    for line in lines:
        if re.fullmatch(
            r"(work |professional |employment )?experience|employment history|work history",
            line,
            re.I,
        ):
            capture = True
            continue
        if capture and re.fullmatch(
            r"education|skills|projects|certifications|technical skills|achievements",
            line,
            re.I,
        ):
            break
        if capture:
            experience.append(line)
    return {
        "skills": skills_in(text),
        "preferred_roles": roles[:3],
        "experience": "\n".join(experience)[:10000],
    }


def extract(filename, data):
    suffix = Path(filename).suffix.lower()
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Upload a nonempty resume smaller than 5 MB.")
    if suffix == ".txt":
        result = data.decode("utf-8-sig")
        if "\x00" in result:
            raise ValueError("Upload a UTF-8 text file.")
    elif suffix == ".pdf":
        from pypdf import PdfReader

        if not data.startswith(b"%PDF"):
            raise ValueError("This is not a valid PDF.")
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("Upload a PDF without password protection.")
        if len(reader.pages) > 20:
            raise ValueError("Use a resume with at most 20 pages.")
        result = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif suffix == ".docx":
        from defusedxml import ElementTree

        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if (
                len(archive.infolist()) > 2000
                or sum(i.file_size for i in archive.infolist()) > 20 * 1024 * 1024
            ):
                raise ValueError("This document is too large after decompression.")
            node = ElementTree.fromstring(archive.read("word/document.xml"))
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            result = "\n".join(
                "".join(p.itertext()) for p in node.findall(".//w:p", ns)
            )
    else:
        raise ValueError("Supported formats: PDF, DOCX, and UTF-8 TXT.")
    result = result.strip().replace("\x00", "")
    if len(result) < 30:
        raise ValueError(
            "No usable text found. For scanned PDFs, export a searchable PDF or upload a text resume."
        )
    if len(result) > 80000:
        raise ValueError(
            "Resume text exceeds 80,000 characters. Upload a shorter document."
        )
    return result


def extract_isolated(filename, data):
    """A malformed document cannot hang the API worker indefinitely."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "backend.resume_parser", filename],
            input=data,
            capture_output=True,
            timeout=20,
            cwd=Path(__file__).resolve().parent.parent,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode:
            raise ValueError(
                "Could not safely read this resume. Try a searchable PDF or TXT file."
            )
        payload = json.loads(result.stdout)
        if "error" in payload:
            raise ValueError(payload["error"])
        return payload["text"]
    except subprocess.TimeoutExpired:
        raise ValueError(
            "Resume processing timed out. Try a smaller searchable PDF or TXT file."
        ) from None


if __name__ == "__main__":
    if os.name != "nt":
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
    try:
        payload = {"text": extract(sys.argv[1], sys.stdin.buffer.read(MAX_BYTES + 1))}
    except ValueError as e:
        payload = {"error": str(e)}
    except Exception:
        payload = {
            "error": "Could not read this document. Try a searchable PDF, DOCX, or TXT file."
        }
    sys.stdout.buffer.write(json.dumps(payload).encode("utf-8"))

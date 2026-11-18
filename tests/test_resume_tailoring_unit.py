import json

import pytest

from backend import resume_tailoring


RESUME = "Python Developer\nSkills: Python\nExperience: Built a small Python API."
JOB = "We require Python to build APIs."


def response_for(draft):
    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "choices": [
                    {"message": {"content": json.dumps(draft)}}
                ]
            }

    return Response()


def valid_draft():
    return {
        "fit_summary": "The resume shows Python API work relevant to the posting.",
        "keyword_review": [
            {
                "phrase": "Python",
                "priority": "required",
                "category": "technical",
                "job_evidence": "We require Python to build APIs.",
                "resume_evidence": "Python",
            }
        ],
        "skills_gaps": [],
        "experience_rewrites": [
            {
                "source_evidence": "Built a small Python API.",
                "rewritten_bullet": "Built a Python API.",
            }
        ],
        "ats_notes": [],
        "latex_source": (
            "\\documentclass{article}\n"
            "\\begin{document}\n"
            "\\section*{Skills}\nPython\n"
            "\\end{document}\n"
        ),
    }


def test_generate_accepts_supported_draft_and_checks_layout(monkeypatch):
    monkeypatch.setattr(
        resume_tailoring.httpx,
        "post",
        lambda *args, **kwargs: response_for(valid_draft()),
    )

    draft, checks = resume_tailoring.generate(
        api_key="test-key",
        model="test-model",
        resume_text=RESUME,
        job_title="Python Developer",
        company="Example",
        job_text=JOB,
    )

    assert draft.keyword_review[0].resume_evidence == "Python"
    assert checks == {
        "complete_latex_document": True,
        "no_tables_graphics_or_columns": True,
        "safe_latex_commands_and_packages": True,
        "standard_section_heading_present": True,
    }


def test_generate_rejects_new_numbers_in_latex(monkeypatch):
    draft = valid_draft()
    draft["latex_source"] = draft["latex_source"].replace(
        "\\section*{Skills}", "\\section*{Skills}\nGPA: 4.0"
    )
    monkeypatch.setattr(
        resume_tailoring.httpx,
        "post",
        lambda *args, **kwargs: response_for(draft),
    )

    with pytest.raises(resume_tailoring.TailoringProviderError, match="added a number"):
        resume_tailoring.generate(
            api_key="test-key",
            model="test-model",
            resume_text=RESUME,
            job_title="Python Developer",
            company="Example",
            job_text=JOB,
        )


def test_generate_rejects_unquoted_job_phrase(monkeypatch):
    draft = valid_draft()
    draft["keyword_review"][0]["job_evidence"] = "Build Python services."
    monkeypatch.setattr(
        resume_tailoring.httpx,
        "post",
        lambda *args, **kwargs: response_for(draft),
    )

    with pytest.raises(resume_tailoring.TailoringProviderError, match="not in the saved description"):
        resume_tailoring.generate(
            api_key="test-key",
            model="test-model",
            resume_text=RESUME,
            job_title="Python Developer",
            company="Example",
            job_text=JOB,
        )


def test_format_checks_reject_file_commands_and_unknown_packages():
    latex = (
        "\\documentclass{article}\n"
        "\\usepackage{shellesc}\n"
        "\\begin{document}\n"
        "\\section*{Skills}\n\\write18{whoami}\n"
        "\\end{document}\n"
    )

    checks = resume_tailoring._format_checks(latex)

    assert checks["safe_latex_commands_and_packages"] is False

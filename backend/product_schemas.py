from typing import Literal
from uuid import UUID
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)
from backend.schemas import Input


class RegisterInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Enter your name.")
        return value.strip()


class RecoverInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    recovery_code: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class SearchPreferences(Input):
    career_stage: Literal["fresher", "experienced"]
    professional_years: float = Field(ge=0, le=50)
    internship_months: int = Field(ge=0, le=120)
    strongest_skills: list[str] = Field(default_factory=list, max_length=10)
    employment_types: list[
        Literal["full_time", "internship", "contract", "part_time"]
    ] = Field(min_length=1, max_length=4)
    workplace: Literal["any", "remote", "hybrid", "onsite"]
    include_senior: bool = False
    include_uncertain_experience: bool = False
    internship_pay: Literal["paid", "unpaid", "any"] = "any"

    @model_validator(mode="after")
    def validate_experience(self):
        if self.career_stage == "fresher" and (
            self.professional_years != 0 or self.include_senior
        ):
            raise ValueError(
                "Freshers must have zero professional years and cannot include senior roles."
            )
        if self.career_stage == "experienced" and self.professional_years <= 0:
            raise ValueError(
                "Enter your relevant professional experience, or select Fresher."
            )
        return self


class ProfileInput(Input):
    search_preferences: SearchPreferences
    skills: list[str] = Field(min_length=1, max_length=60)
    preferred_roles: list[str] = Field(min_length=1, max_length=5)
    experience: str = Field(default="", max_length=10000)
    location: str = Field(default="", max_length=255)
    country: str = Field(default="in", pattern="^[a-z]{2}$")

    @field_validator("skills", "preferred_roles")
    @classmethod
    def clean_items(cls, values):
        cleaned = []
        for value in values:
            value = value.strip()
            if not value or len(value) > 100:
                raise ValueError("Use nonempty entries of at most 100 characters.")
            if value.casefold() not in [v.casefold() for v in cleaned]:
                cleaned.append(value)
        return cleaned

    @model_validator(mode="after")
    def confirm_strongest_skills(self):
        from backend.requirements_parser import canonical

        skills = {canonical(value) for value in self.skills}
        strongest = self.search_preferences.strongest_skills
        if any(not value.strip() or len(value) > 100 for value in strongest):
            raise ValueError("Use nonempty priority skills of at most 100 characters.")
        missing = [
            value.strip() for value in strongest if canonical(value) not in skills
        ]
        if missing:
            raise ValueError(
                "These priority skills are missing from the Skills field: "
                + ", ".join(missing)
                + ". Add them to Skills above if they describe you, or remove them from Priority skills."
            )
        self.search_preferences.strongest_skills = list(
            dict.fromkeys(canonical(v) for v in strongest)
        )
        return self


class DiscoveryInput(Input):
    resume_id: UUID | None = None
    profile_fingerprint: str | None = Field(default=None, pattern="^[a-f0-9]{64}$")
    source: str = Field(default="greenhouse", pattern="^(all|greenhouse|ashby|lever|adzuna)$")


class ConfirmApplication(Input):
    confirmed: bool


class TailorResumeInput(Input):
    external_processing_confirmed: bool
    model_config = ConfigDict(extra="forbid")

    @field_validator("external_processing_confirmed")
    @classmethod
    def confirm_external_processing(cls, value):
        if not value:
            raise ValueError(
                "Confirm that your resume and this job description may be sent to Groq."
            )
        return value

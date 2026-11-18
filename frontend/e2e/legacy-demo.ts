import { test, expect } from "@playwright/test";
import path from "node:path";

test("visitor explores dashboard, filters jobs, and downloads Excel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "A clearer view of your job search." }),
  ).toBeVisible();
  await expect(
    page.getByText("Sample demo — read only.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".stat-card").first().locator("strong")).toHaveText(
    "10",
  );
  await expect(page.locator(".recent-panel tbody tr")).toHaveCount(5);
  await page.screenshot({
    path: path.join(
      process.env.E2E_ARTIFACT_DIR || "test-results",
      "demo-desktop.png",
    ),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Job board", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search jobs and companies" })
    .fill("Orbit");
  await expect(page.locator(".job-card")).toHaveCount(1);
  await page
    .getByRole("link", { name: "Junior Python Developer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "About this opportunity" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Track application", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Owner sign-in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("link", { name: "Applications", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Filter by status" })
    .selectOption("interview");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  expect((await download).suggestedFilename()).toBe("job-applications.xlsx");
});

test("owner adds a job, edits it, tracks it, and persists a status timeline", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Owner sign-in" }).click();
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("owner@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Add a job", exact: true }).click();
  await page.getByLabel("Job title", { exact: true }).fill("Python Developer");
  await page.getByLabel("Company", { exact: true }).fill("Willow Studio");
  await page.getByLabel("Location", { exact: true }).fill("Remote");
  await page.getByLabel("Platform", { exact: true }).fill("Company careers");
  await page
    .getByLabel("Job URL", { exact: true })
    .fill("https://example.invalid/browser-test/willow");
  await page
    .getByLabel("Job description", { exact: true })
    .fill(
      "A fictional role building Python APIs and learning through code reviews.",
    );
  await page.getByRole("button", { name: "Add job", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Python Developer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit job", exact: true }).click();
  await page.getByLabel("Location", { exact: true }).fill("Remote, India");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".page-heading")).toContainText("Remote, India");
  await page
    .getByRole("button", { name: "Track application", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("applied");
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Fictional application prepared for the demo.");
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(
    page.getByRole("heading", { name: "Application timeline" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Update application" }).click();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("interview");
  await page
    .getByRole("textbox", { name: "Notes", exact: true })
    .fill("Review Python and SQL examples before the mock interview.");
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.locator(".timeline li")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".page-heading .badge")).toHaveText("Interview");
  await expect(
    page.getByText("Review Python and SQL examples before the mock interview."),
  ).toBeVisible();
  await expect(page.locator(".timeline")).toContainText(
    "Applied → Interview",
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByText("Sample demo — read only.", { exact: false }),
  ).toBeVisible();
});

test("mobile layout, empty state, and recoverable database error", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(
    page.locator(".stat-card").first().locator("strong"),
  ).not.toHaveText("—");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".recent-panel tbody tr")).toHaveCount(5);
  await page.screenshot({
    path: path.join(
      process.env.E2E_ARTIFACT_DIR || "test-results",
      "demo-mobile.png",
    ),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Job board", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search jobs and companies" })
    .fill("No such imaginary job");
  await expect(
    page.getByRole("heading", { name: "No jobs found" }),
  ).toBeVisible();
  await page.route("**/api/jobs?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "The database is temporarily unavailable. Please try again.",
      }),
    }),
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "database is temporarily unavailable",
  );
  await page.unroute("**/api/jobs?**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".job-card").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importSubmissionsAction } from "@/app/(app)/grants/actions";
import { toCsv } from "@/lib/csv";
import { grantSchema } from "@/lib/grants";
import { normaliseSubmissionDate, optionalAnswer, parseAddress, submissionColumnForHeader } from "@/lib/submissions-csv";
import { db } from "@/server/db/client";
import { expectRedirect, makeUser, resetDatabase, signIn } from "./support/fixtures";
import { actAs } from "./support/request";

/** The header of the form's submissions report, exactly as exported. */
const HEADER = [
  "Name of Charity/Organisation", "Charity Registration Number ( England & Wales)", "Year Established", "Organisation Address",
  "Brief Description Of Your Organisation", "Website", "Name", "Position In Organisation", "Email (This will used for communication)",
  "Select the category which best describes the work of your organisation", "Grant Request Amount (£)",
  "Brief description of your application for funding", "What is the date of your latest audited accounts?", "Income (£)",
  "Expenditure (£)", "Number Of Employees", "Number of Volunteers", "Number of Trustees", "Funding from government / local authority (£)",
  "Other funders", "What is your pence-in-the-pound ratio (0-100)", "Random ID", "Status", "Date Discussed",
  "Recommended/Approved Amount (GBP)", "Modified Time", "IP Address", "Added Email ID", "Task Owner", "Referrer Name", "Added Time",
];

type Row = Partial<Record<(typeof HEADER)[number], string>>;

const submission = (overrides: Row = {}): Row => ({
  "Name of Charity/Organisation": "Riverside Food Bank",
  "Charity Registration Number ( England & Wales)": "1234567",
  "Year Established": "1998",
  "Organisation Address": "Unit 4, Mill Lane Industrial Estate\nRiverside Road\nLeeds\nLS1 4AB",
  "Brief Description Of Your Organisation": "Emergency food parcels for families in crisis.",
  Website: "www.riverside.example",
  Name: "Sam Patel",
  "Position In Organisation": "Treasurer",
  "Email (This will used for communication)": "Sam@Riverside.example",
  "Select the category which best describes the work of your organisation": "poverty relief",
  "Grant Request Amount (£)": "£2,500",
  "Brief description of your application for funding": "A chest freezer for donated food.",
  "What is the date of your latest audited accounts?": "31-Mar-2026",
  "Income (£)": "120,000",
  "Expenditure (£)": "£110,500.50",
  "Number Of Employees": "3",
  "Number of Volunteers": "1,200",
  "Number of Trustees": "7",
  "Funding from government / local authority (£)": "N/A",
  "Other funders": "Community Foundation",
  "What is your pence-in-the-pound ratio (0-100)": "85p",
  "Random ID": "4471200000012345",
  Status: "",
  "Date Discussed": "",
  "Recommended/Approved Amount (GBP)": "",
  "Modified Time": "28-Oct-2026 09:00:00",
  "IP Address": "203.0.113.7",
  "Added Email ID": "sam@riverside.example",
  "Task Owner": "",
  "Referrer Name": "https://example.org/apply",
  "Added Time": "27-Oct-2026 14:32:10",
  ...overrides,
});

const report = (...rows: Row[]) => toCsv([HEADER, ...rows.map((r) => HEADER.map((h) => r[h] ?? ""))]);

function upload(content: string, mode: "check" | "import" = "import") {
  const fd = new FormData();
  fd.set("mode", mode);
  fd.set("file", new File([content], "SubmissionsReport.csv", { type: "text/csv" }));
  return importSubmissionsAction({}, fd);
}

let poverty: { id: string };
let submitted: { id: string };
let approved: { id: string };

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
  poverty = await db().grantCategory.create({ data: { name: "Poverty relief", sortOrder: 1 } });
  await db().grantStatus.create({ data: { name: "Draft", sortOrder: 1 } });
  submitted = await db().grantStatus.create({ data: { name: "Submitted", stage: "SUBMITTED", sortOrder: 2 } });
  approved = await db().grantStatus.create({ data: { name: "Approved", stage: "APPROVED", sortOrder: 3 } });
});
afterAll(() => db().$disconnect());

async function signedInAs(role: "VIEWER" | "EDITOR" | "ADMINISTRATOR") {
  const user = await makeUser(role);
  actAs(await signIn(user.email));
  return user;
}

describe("reading submissions", () => {
  it("recognises the report's columns, ignoring case, punctuation and brackets", () => {
    expect(submissionColumnForHeader("Grant Request Amount (£)")).toBe("amountRequested");
    expect(submissionColumnForHeader("grant request amount")).toBe("amountRequested");
    expect(submissionColumnForHeader("Charity Registration Number")).toBe("registrationNumber");
    expect(submissionColumnForHeader("What is the date of your latest audited accounts")).toBe("accountsDate");
    expect(submissionColumnForHeader("Name")).toBe("contactName");
    expect(submissionColumnForHeader("IP Address")).toBe("ignored");
    expect(submissionColumnForHeader("Favourite colour")).toBeNull();
    for (const h of HEADER) expect(submissionColumnForHeader(h), h).not.toBeNull();
  });

  it("splits free-text addresses", () => {
    expect(parseAddress("Unit 4, Mill Lane\nRiverside Road\nLeeds\nls1 4ab")).toEqual({
      addressLine1: "Unit 4",
      addressLine2: "Mill Lane, Riverside Road",
      town: "Leeds",
      postcode: "LS1 4AB",
      country: "",
    });
    expect(parseAddress("1 High Street, Leeds LS1 1AA, United Kingdom")).toEqual({
      addressLine1: "1 High Street",
      addressLine2: "",
      town: "Leeds",
      postcode: "LS1 1AA",
      country: "United Kingdom",
    });
    expect(parseAddress("The Old School House")).toMatchObject({ addressLine1: "The Old School House", town: "", postcode: "" });
    expect(parseAddress("")).toEqual({ addressLine1: "", addressLine2: "", town: "", postcode: "", country: "" });
  });

  it("accepts the date formats forms export", () => {
    expect(normaliseSubmissionDate("27-Oct-2026 14:32:10")).toBe("2026-10-27");
    expect(normaliseSubmissionDate("7 October 2026")).toBe("2026-10-07");
    expect(normaliseSubmissionDate("27/10/2026 14:32")).toBe("2026-10-27");
    expect(normaliseSubmissionDate("2026-10-27T14:32:10Z")).toBe("2026-10-27");
    expect(normaliseSubmissionDate("31-Feb-2026")).toBe("31/2/2026"); // left for validation to reject
    expect(normaliseSubmissionDate("soon")).toBe("soon");
  });

  it("treats placeholder answers as blank", () => {
    for (const blank of ["N/A", "n/a", "NA", "None", "-", "Exempt", "not registered", "TBC."]) expect(optionalAnswer(blank), blank).toBe("");
    expect(optionalAnswer(" Nationwide ")).toBe("Nationwide");
  });

  it("validates the application figures", () => {
    const base = {
      charityId: "x", categoryId: "x", statusId: "x", purpose: "", dateSubmitted: "2026-10-27", amountRequested: "100",
      amountAgreed: "", decisionDate: "", paymentDate: "", accountsDate: "", income: "", expenditure: "", governmentFunding: "",
      otherFunders: "", penceInPound: "", employees: "", volunteers: "", trustees: "",
    };
    expect(grantSchema.parse({ ...base, penceInPound: "85%", employees: "1,200", income: "£1,000" })).toMatchObject({
      penceInPound: 85,
      employees: 1200,
      income: "1000.00",
      volunteers: null,
    });
    const error = (overrides: Partial<typeof base>) => grantSchema.safeParse({ ...base, ...overrides }).error?.issues[0].message;
    expect(error({ penceInPound: "101" })).toBe("Enter the pence in the pound as a whole number from 0 to 100.");
    expect(error({ trustees: "2.5" })).toMatch(/whole number/);
    expect(error({ employees: "-1" })).toMatch(/whole number/);
    expect(error({ accountsDate: "31/03/2026" })).toBe("Enter a valid date of latest audited accounts.");
  });
});

describe("submissions import", () => {
  it("is only available to editors and above", async () => {
    await expectRedirect(upload(report(submission())), "/sign-in");
    await signedInAs("VIEWER");
    await expectRedirect(upload(report(submission())), "/forbidden");
    expect(await db().grant.count()).toBe(0);
  });

  it("checks a file without saving it", async () => {
    await signedInAs("EDITOR");
    const result = await upload(report(submission()), "check");
    expect(result.summary).toMatchObject({ saved: false, created: 1, rowErrorCount: 0, notes: ["1 new charity"] });
    expect(await db().charity.count()).toBe(0);
    expect(await db().grant.count()).toBe(0);
  });

  it("adds the charity and the grant with every answer", async () => {
    const editor = await signedInAs("EDITOR");
    const result = await upload(report(submission()));
    expect(result.summary).toMatchObject({ saved: true, created: 1, rowErrorCount: 0, fileErrors: [] });

    const charity = await db().charity.findFirstOrThrow();
    expect(charity).toMatchObject({
      name: "Riverside Food Bank",
      registrationNumber: "1234567",
      yearEstablished: 1998,
      description: "Emergency food parcels for families in crisis.",
      addressLine1: "Unit 4",
      addressLine2: "Mill Lane Industrial Estate, Riverside Road",
      town: "Leeds",
      postcode: "LS1 4AB",
      website: "https://www.riverside.example",
      contactName: "Sam Patel",
      contactPosition: "Treasurer",
      contactEmail: "sam@riverside.example",
      createdById: editor.id,
    });
    const grant = await db().grant.findFirstOrThrow();
    expect(grant).toMatchObject({
      charityId: charity.id,
      categoryId: poverty.id,
      statusId: submitted.id, // blank status: the first active "awaiting decision" status
      purpose: "A chest freezer for donated food.",
      dateSubmitted: new Date("2026-10-27T00:00:00Z"),
      accountsDate: new Date("2026-03-31T00:00:00Z"),
      otherFunders: "Community Foundation",
      governmentFunding: null,
      penceInPound: 85,
      employees: 3,
      volunteers: 1200,
      trustees: 7,
      submissionReference: "4471200000012345",
      createdById: editor.id,
    });
    expect([grant.amountRequested.toFixed(2), grant.income?.toFixed(2), grant.expenditure?.toFixed(2)]).toEqual(["2500.00", "120000.00", "110500.50"]);
  });

  it("records decisions, and skips submissions imported before", async () => {
    await signedInAs("EDITOR");
    const decided = submission({
      "Random ID": "2",
      "Added Time": "28-Oct-2026 10:00:00",
      Status: "approved",
      "Date Discussed": "05/11/2026",
      "Recommended/Approved Amount (GBP)": "2000",
    });
    expect((await upload(report(submission({ "Random ID": "1" }), decided))).summary).toMatchObject({ saved: true, created: 2 });
    expect(await db().grant.findFirstOrThrow({ where: { submissionReference: "2" } })).toMatchObject({
      statusId: approved.id,
      decisionDate: new Date("2026-11-05T00:00:00Z"),
    });

    // The report grows: only the new submission is added.
    const again = await upload(report(submission({ "Random ID": "1" }), decided, submission({ "Random ID": "3", "Added Time": "29-Oct-2026 08:15:00" })));
    expect(again.summary).toMatchObject({ saved: true, created: 1 });
    expect(again.summary?.notes).toContain("2 submissions were imported before and will be skipped");
    expect(await db().grant.count()).toBe(3);
    expect(await db().charity.count()).toBe(1);
  });

  it("skips an application from a charity that already has one on the same day", async () => {
    const riverside = await db().charity.create({ data: { name: "Riverside Food Bank", registrationNumber: "1234567" } });
    await db().grant.create({
      data: { charityId: riverside.id, categoryId: poverty.id, statusId: submitted.id, dateSubmitted: new Date("2026-10-27T00:00:00Z"), amountRequested: 100 },
    });
    await signedInAs("EDITOR");
    const result = await upload(
      report(
        submission({ "Random ID": "1" }), // same day as the recorded grant
        submission({ "Random ID": "2", "Added Time": "28-Oct-2026 09:00:00" }),
        submission({ "Random ID": "3", "Added Time": "28-Oct-2026 17:45:00" }), // same day as row 3
        submission({ "Name of Charity/Organisation": "Valley Arts", "Charity Registration Number ( England & Wales)": "", "Random ID": "4" }),
      ),
    );
    expect(result.summary).toMatchObject({ saved: true, created: 2, rowErrorCount: 0 });
    expect(result.summary?.notes).toContain("2 submissions are from a charity with an application on the same day and will be skipped");
    const grants = await db().grant.findMany({ select: { submissionReference: true }, orderBy: { submissionReference: "asc" } });
    expect(grants.map((g) => g.submissionReference)).toEqual([null, "2", "4"]);
  });

  it("only fills in an existing charity's blank details", async () => {
    const existing = await db().charity.create({
      data: { name: "Riverside Foodbank (Leeds)", registrationNumber: "1234567", description: "Our own description.", town: "Wakefield" },
    });
    await signedInAs("EDITOR");
    const result = await upload(report(submission()));
    expect(result.summary?.notes).toEqual(["0 new charities", "1 existing charity matched, 1 with blank details filled in"]);

    expect(await db().charity.count()).toBe(1);
    expect(await db().charity.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({
      name: "Riverside Foodbank (Leeds)",
      description: "Our own description.",
      town: "Wakefield",
      addressLine1: "Unit 4",
      contactName: "Sam Patel",
      website: "https://www.riverside.example",
    });
    expect((await db().grant.findFirstOrThrow()).charityId).toBe(existing.id);
  });

  it("updates the contact from the newest submission", async () => {
    const riverside = await db().charity.create({
      data: { name: "Riverside Food Bank", registrationNumber: "1234567", contactName: "Sam Patel", contactPosition: "Treasurer", contactEmail: "sam@riverside.example" },
    });
    await db().grant.create({
      data: { charityId: riverside.id, categoryId: poverty.id, statusId: submitted.id, dateSubmitted: new Date("2026-10-20T00:00:00Z"), amountRequested: 100 },
    });
    await signedInAs("EDITOR");
    const contact = (name: string, position: string, email: string, added: string, id: string) =>
      submission({ Name: name, "Position In Organisation": position, "Email (This will used for communication)": email, "Added Time": added, "Random ID": id });
    const result = await upload(
      report(
        // The newest wins whatever the order in the file; its blank position isn't filled from an older contact.
        contact("Jo Bloggs", "", "jo@riverside.example", "29-Oct-2026 10:00:00", "1"),
        contact("Alex Jones", "Chair", "alex@riverside.example", "27-Oct-2026 10:00:00", "2"),
        // Older than the application already recorded.
        contact("Old Contact", "Secretary", "old@riverside.example", "15-Oct-2026 10:00:00", "3"),
      ),
    );
    expect(result.summary).toMatchObject({ saved: true, created: 3 });
    expect(result.summary?.notes).toContain("1 existing charity matched, 1 with blank details filled in, 1 with contact details updated");
    expect(await db().charity.findUniqueOrThrow({ where: { id: riverside.id } })).toMatchObject({
      name: "Riverside Food Bank",
      contactName: "Jo Bloggs",
      contactPosition: null,
      contactEmail: "jo@riverside.example",
      addressLine1: "Unit 4", // still only filled in because it was blank
    });

    // A later report with an older submission leaves the contact alone.
    await upload(report(contact("Late Entry", "Chair", "late@riverside.example", "21-Oct-2026 10:00:00", "4")));
    expect((await db().charity.findUniqueOrThrow({ where: { id: riverside.id } })).contactName).toBe("Jo Bloggs");
  });

  it("matches by name when there's no registration number, and adds a charity only once", async () => {
    const hilltop = await db().charity.create({ data: { name: "Hilltop Trust" } });
    await signedInAs("EDITOR");
    const noReg = { "Charity Registration Number ( England & Wales)": "Exempt" };
    const result = await upload(
      report(
        submission({ ...noReg, "Name of Charity/Organisation": "HILLTOP TRUST", "Random ID": "1" }),
        submission({ "Name of Charity/Organisation": "Valley Arts", "Charity Registration Number ( England & Wales)": "", "Random ID": "2" }),
        // Same new charity again, now giving its registration number: filled in, not added twice.
        submission({
          "Name of Charity/Organisation": "Valley Arts",
          "Charity Registration Number ( England & Wales)": "7654321",
          "Random ID": "3",
          "Added Time": "28-Oct-2026 09:00:00",
        }),
      ),
    );
    expect(result.summary).toMatchObject({ saved: true, created: 3, notes: ["1 new charity", "1 existing charity matched, 1 with blank details filled in"] });

    const charities = await db().charity.findMany({ orderBy: { name: "asc" } });
    expect(charities.map((c) => [c.name, c.registrationNumber])).toEqual([
      ["Hilltop Trust", null],
      ["Valley Arts", "7654321"],
    ]);
    expect(await db().grant.count({ where: { charityId: hilltop.id } })).toBe(1);
  });

  it("never matches a charity with a different registration number by name", async () => {
    await db().charity.create({ data: { name: "Riverside Food Bank", registrationNumber: "1111111" } });
    await signedInAs("EDITOR");
    expect((await upload(report(submission()))).summary).toMatchObject({ saved: true, notes: ["1 new charity"] });
    expect(await db().charity.count({ where: { name: "Riverside Food Bank" } })).toBe(2);
  });

  it("asks for a registration number when several charities have the name", async () => {
    await db().charity.createMany({ data: [{ name: "St Mary's" }, { name: "St Mary's" }] });
    await signedInAs("EDITOR");
    const result = await upload(
      report(submission({ "Name of Charity/Organisation": "st mary's", "Charity Registration Number ( England & Wales)": "" })),
    );
    expect(result.summary?.rowErrors).toEqual([
      { row: 2, message: "Charity name: 2 charities are called “st mary's”. Add the registration number to say which one." },
    ]);
  });

  it("reports every problem and saves nothing", async () => {
    await db().grantCategory.create({ data: { name: "Old", active: false, sortOrder: 2 } });
    await signedInAs("EDITOR");
    const result = await upload(
      report(
        submission({ "Random ID": "1" }),
        submission({
          "Random ID": "2",
          "Select the category which best describes the work of your organisation": "Sport",
          Website: "not a website",
          "Grant Request Amount (£)": "",
        }),
        submission({ "Random ID": "3", "Select the category which best describes the work of your organisation": "old", Status: "Pending review" }),
        submission({ "Random ID": "1" }),
        submission({ "Random ID": "5", "What is your pence-in-the-pound ratio (0-100)": "120" }),
        submission({ "Random ID": "6", "Recommended/Approved Amount (GBP)": "500" }),
      ),
    );
    expect(result.summary?.saved).toBe(false);
    expect(result.summary?.rowErrors).toEqual([
      {
        row: 3,
        message:
          "Website: Enter a valid website address, e.g. https://example.org. Category: no category is called “Sport”. Add it under Settings → Grant categories. Grant request amount: Enter the amount requested.",
      },
      { row: 4, message: "Category: “Old” is inactive. Status: no status is called “Pending review”." },
      { row: 5, message: "Has the same Random ID as row 2." },
      { row: 6, message: "Pence in the pound: Enter the pence in the pound as a whole number from 0 to 100." },
      { row: 7, message: "Date discussed: Enter the decision date for the agreed amount." },
    ]);
    expect(await db().charity.count()).toBe(0);
    expect(await db().grant.count()).toBe(0);
  });

  it("needs the key columns, and lists columns it doesn't import", async () => {
    await signedInAs("EDITOR");
    const missing = await upload("Name of Charity/Organisation,Website\nRiverside,\n");
    expect(missing.summary?.fileErrors).toEqual([
      "The file needs a “Select the category which best describes the work of your organisation” column.",
      "The file needs a “Grant Request Amount (£)” column.",
      "The file needs a “Added Time” column.",
    ]);

    const extra = await upload(
      toCsv([
        ["Name of Charity/Organisation", "Select the category which best describes the work of your organisation", "Grant Request Amount (£)", "Added Time", "How did you hear about us?"],
        ["Riverside", "Poverty relief", "100", "27/10/2026", "Newsletter"],
      ]),
      "check",
    );
    expect(extra.summary).toMatchObject({ created: 1, rowErrorCount: 0 });
    expect(extra.summary?.notes).toContain("Column not imported: “How did you hear about us?”");
  });

  it("needs an awaiting-decision status when the status is blank", async () => {
    await db().grantStatus.update({ where: { id: submitted.id }, data: { active: false } });
    await signedInAs("EDITOR");
    const result = await upload(report(submission()));
    expect(result.summary?.rowErrors[0].message).toBe("Status: it's blank, and no active status has the “Awaiting decision” stage to use instead.");
  });
});

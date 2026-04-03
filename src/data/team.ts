export type TeamSchool = "RISD" | "BROWN" | "BROWN|RISD";

interface MemberFrontmatter {
  grad: number;
  name: string;
  roles?: string | string[];
  school: string;
}

export interface TeamMember {
  displayName: string;
  grad: number;
  name: string;
  role: string;
  school: TeamSchool;
}

export interface AlumniClass {
  label: string;
  members: TeamMember[];
  year: number;
}

const memberModules = import.meta.glob("../content/members/**/*.md", {
  eager: true
}) as Record<string, { frontmatter: MemberFrontmatter }>;

const currentDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  timeZone: "America/New_York",
  year: "numeric"
});

const currentDateParts = currentDateFormatter
  .formatToParts(new Date())
  .reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }

    return parts;
  }, {});

const currentYear = Number.parseInt(currentDateParts.year ?? "0", 10);
const currentMonth = Number.parseInt(currentDateParts.month ?? "1", 10);

// The Brown/RISD academic year turns over in September, so seniors remain
// current members through the summer after their graduation year.
const currentAcademicYear = currentMonth >= 9 ? currentYear + 1 : currentYear;

const normalizeSchool = (school: string): TeamSchool => {
  const normalized = school
    .split("|")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  const hasBrown = normalized.includes("BROWN");
  const hasRisd = normalized.includes("RISD");

  if (hasBrown && hasRisd) {
    return "BROWN|RISD";
  }

  return hasRisd ? "RISD" : "BROWN";
};

const normalizeRole = (roles?: string | string[]) => {
  if (Array.isArray(roles)) {
    return roles[0] ?? "Member";
  }

  return roles ?? "Member";
};

const formatDisplayName = (name: string, grad: number) =>
  `${name.toLocaleUpperCase("en-US")} ‘${String(grad).slice(-2)}`;

const sortMembers = (left: TeamMember, right: TeamMember) =>
  left.grad - right.grad || left.name.localeCompare(right.name);

const allMembers = Object.values(memberModules)
  .map(({ frontmatter }) => ({
    displayName: formatDisplayName(frontmatter.name, frontmatter.grad),
    grad: frontmatter.grad,
    name: frontmatter.name,
    role: normalizeRole(frontmatter.roles),
    school: normalizeSchool(frontmatter.school)
  }))
  .sort(sortMembers);

export const currentMembers = allMembers.filter(
  (member) => member.grad >= currentAcademicYear
);

export const alumniClasses = Object.values(
  allMembers
    .filter((member) => member.grad < currentAcademicYear)
    .reduce<Record<number, AlumniClass>>((classes, member) => {
      classes[member.grad] ??= {
        label: `CLASS OF ${member.grad}`,
        members: [],
        year: member.grad
      };
      classes[member.grad].members.push(member);
      return classes;
    }, {})
)
  .map((alumniClass) => ({
    ...alumniClass,
    members: [...alumniClass.members].sort(sortMembers)
  }))
  .sort((left, right) => right.year - left.year);

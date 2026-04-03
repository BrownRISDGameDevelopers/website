export type TeamSchool = "RISD" | "BROWN" | "BROWN|RISD";

export interface TeamMemberGame {
  role: string;
  title: string;
}

export interface TeamMemberLink {
  label: string;
  url: string;
}

interface MemberFrontmatter {
  grad: number;
  games?: TeamMemberGame[] | null;
  links?: TeamMemberLink[] | null;
  name: string;
  roles?: string | string[];
  school: string;
}

export interface TeamMember {
  bio: string;
  displayName: string;
  games: TeamMemberGame[];
  grad: number;
  links: TeamMemberLink[];
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

const rawMemberModules = import.meta.glob("../content/members/**/*.md", {
  eager: true,
  import: "default",
  query: "?raw"
}) as Record<string, string>;

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

const normalizeGames = (games?: TeamMemberGame[] | null) =>
  Array.isArray(games)
    ? games.filter(
        (game): game is TeamMemberGame =>
          typeof game?.title === "string" &&
          game.title.length > 0 &&
          typeof game.role === "string" &&
          game.role.length > 0
      )
    : [];

const normalizeLinks = (links?: TeamMemberLink[] | null) =>
  Array.isArray(links)
    ? links.filter(
        (link): link is TeamMemberLink =>
          typeof link?.label === "string" &&
          link.label.length > 0 &&
          typeof link.url === "string" &&
          link.url.length > 0
      )
    : [];

const extractMemberBio = (rawContent: string) => {
  const body = rawContent.replace(/^---[\s\S]*?---\s*/, "").trim();

  if (!body || body === "Bio.") {
    return "Bio coming soon.";
  }

  return body;
};

const formatDisplayName = (name: string, grad: number) =>
  `${name.toLocaleUpperCase("en-US")} ‘${String(grad).slice(-2)}`;

const sortMembers = (left: TeamMember, right: TeamMember) =>
  left.grad - right.grad || left.name.localeCompare(right.name);

const allMembers = Object.entries(memberModules)
  .filter(([path]) => !path.endsWith("/template.md"))
  .map(([path, { frontmatter }]) => ({
    bio: extractMemberBio(rawMemberModules[path] ?? ""),
    displayName: formatDisplayName(frontmatter.name, frontmatter.grad),
    games: normalizeGames(frontmatter.games),
    grad: frontmatter.grad,
    links: normalizeLinks(frontmatter.links),
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

const easternDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'numeric',
});

export const getAcademicYear = (date = new Date()) => {
  const parts = easternDate.formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')!.value);
  const month = Number(parts.find(part => part.type === 'month')!.value);
  return month >= 9 ? year + 1 : year;
};

export const getNextRollover = (date = new Date()) =>
  // September 1 is in Eastern daylight time (UTC-4).
  Date.UTC(getAcademicYear(date), 8, 1, 4);

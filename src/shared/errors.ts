/** Friendly messages for API error codes (PRD §20). Never expose internals. */
export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE: 'That tutor code is invalid or inactive. Please check the code and try again.',
  RATE_LIMITED: 'Too many unsuccessful attempts. Please wait a few minutes before trying again.',
  UNAUTHENTICATED: 'Your session has expired. Please enter your tutor code again.',
  TUTOR_INACTIVE: 'Your tutor access is no longer active. Please contact Ms Aida.',
  NOT_ASSIGNED: 'You are not assigned to this class. Please contact Ms Aida if you are covering it.',
  NOT_OWNER: 'This attendance was recorded by another tutor and cannot be opened with your code.',
  NOT_FOUND: 'The requested attendance record could not be found.',
  EDIT_WINDOW_CLOSED:
    'This attendance can no longer be edited by tutors because the class date has ended (Malaysia time). Please contact Ms Aida for any correction.',
  DUPLICATE_SESSION: 'Attendance for this class, date and time has already been saved.',
  UNMARKED_STUDENTS: 'Every student must be marked Present or Absent before saving.',
  DUPLICATE_STUDENT: 'A student appears more than once in the attendance list.',
  NOT_IN_ROSTER: 'The attendance list contains a student who is not on this class roster. Please reload the page.',
  EMPTY_ROSTER: 'This class has no active students. Please inform Ms Aida.',
  FUTURE_DATE: 'The class date cannot be in the future.',
  CLASS_REQUIRED: 'Select a Class / Subject.',
  DATE_REQUIRED: 'Select the class date.',
  TIME_REQUIRED: 'Enter the class time.',
  INVALID_PAYLOAD: 'The request was not valid. Please reload the page and try again.',
  FORBIDDEN_FIELD: 'That change is not permitted for tutors.',
  FORBIDDEN: 'You do not have permission to do that.',
  PREFIX_IN_USE: 'Another active tutor already uses that code prefix.',
  SERVER_ERROR: 'Something went wrong on the server. Your data was not saved – please try again.',
  NETWORK_ERROR: 'Network problem – the request could not reach the server. Your data was not saved; please retry.',
  CSRF: 'The request was blocked for security reasons. Please reload the page.',
};

export function errorMessage(code: string | undefined, fallback = ERROR_MESSAGES.SERVER_ERROR): string {
  return (code && ERROR_MESSAGES[code]) || fallback;
}

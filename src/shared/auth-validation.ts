const EMAIL_PATTERN = /^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const MINIMUM_PASSWORD_LENGTH = 8;

export function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function signInError(email: string, password: string): string | null {
  const trimmed = normalizedEmail(email);
  if (!trimmed) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(trimmed)) return "Enter a valid email address.";
  if (!password) return "Enter your password.";
  return null;
}

export function signUpError(
  email: string,
  password: string,
  confirmPassword: string,
  phoneNumber: string,
): string | null {
  const trimmed = normalizedEmail(email);
  if (!trimmed) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(trimmed)) return "Enter a valid email address.";
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  }
  if (confirmPassword !== password) return "Passwords do not match.";
  const phone = phoneNumber.trim();
  if (phone && !phone.startsWith("+")) {
    return "Phone numbers must use international format, e.g. +15551234567.";
  }
  return null;
}

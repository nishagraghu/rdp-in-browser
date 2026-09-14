export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validateUsername(username: string): boolean {
  return typeof username === 'string' && username.trim().length >= 3;
}

export function validatePassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6;
}

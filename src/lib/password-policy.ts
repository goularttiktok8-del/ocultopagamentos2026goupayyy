export function passwordPolicyError(password: string) {
  if (password.length < 12) return 'Use ao menos 12 caracteres na senha.';
  if (!/[a-z]/.test(password)) return 'Inclua uma letra minúscula na senha.';
  if (!/[A-Z]/.test(password)) return 'Inclua uma letra maiúscula na senha.';
  if (!/\d/.test(password)) return 'Inclua um número na senha.';
  if (!/[^A-Za-z0-9\s]/.test(password)) return 'Inclua um símbolo na senha.';
  return null;
}

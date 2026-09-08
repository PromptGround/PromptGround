const TOKEN_KEY = 'promptground_jwt_token';
const USER_KEY = 'promptground_user_profile';

export function getStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userStr = localStorage.getItem(USER_KEY);
  if (!token || !userStr) return null;
  try {
    const user = JSON.parse(userStr);
    return { token, user };
  } catch (e) {
    return null;
  }
}

export function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function canWriteToEnv(user, env) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'viewer') return false;
  // Editors can direct write to dev, but upper environments require PR
  return env === 'development';
}

export function canPromote(user) {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'editor';
}

export function isAdmin(user) {
  return user && user.role === 'admin';
}

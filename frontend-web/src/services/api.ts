import axios from 'axios';

/**
 * URL del backend de la plataforma (NestJS).
 * Se puede sobreescribir con VITE_API_URL en un archivo .env.
 * Si no se define en producción (ej. IP de AWS EC2 o dominio), detecta automáticamente
 * el host del navegador para evitar llamadas erróneas a localhost.
 */
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : 'http://localhost:3000');

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Adjunta el token JWT (si existe) a cada petición.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

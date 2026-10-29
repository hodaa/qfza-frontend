/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_CONTACT_FORM_ENDPOINT?: string;
  readonly VITE_CSRF_TOKEN?: string;
  readonly VITE_CSRF_HEADER_NAME?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_DRIVE_API_KEY?: string;
  readonly VITE_DRIVE_STREAM_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

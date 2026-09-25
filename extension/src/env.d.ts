/** Build-time settings read by `lib/config.ts`. All are optional. */
interface ImportMetaEnv {
  readonly WXT_API_BASE?: string;
  readonly WXT_SITE_BASE?: string;
  readonly WXT_VERIFY_BASE?: string;
}

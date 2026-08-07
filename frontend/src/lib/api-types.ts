/**
 * Shapes returned by the backend's JSON API.
 */

export interface SessionInfo {
  signedIn: boolean;
  who: string | null;
}

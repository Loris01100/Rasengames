export interface Env {
  ASSETS: Fetcher;
  UNDERCOVER_ROOM: DurableObjectNamespace;
  HUNDRED_ROOM: DurableObjectNamespace;
  BAC_ROOM: DurableObjectNamespace;
  WHOAMI_ROOM: DurableObjectNamespace;
  DETECTIVE_ROOM: DurableObjectNamespace;
  NOTE_ROOM: DurableObjectNamespace;
  BOMB_ROOM: DurableObjectNamespace;
  CODENAMES_ROOM: DurableObjectNamespace;
  SYNC_ROOM: DurableObjectNamespace;
  GUESSWHO_ROOM: DurableObjectNamespace;
  PARTY_ROOM: DurableObjectNamespace;
  UNDERCOVER_FEEDBACK: DurableObjectNamespace;
  ADMIN_KEY?: string;
  LOBBY_REGISTRY: DurableObjectNamespace;
}

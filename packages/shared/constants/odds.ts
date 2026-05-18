export const CHAMPION_ODDS: Record<string, number> = {
  ESP: 5.4,
  FRA: 6.0,
  ENG: 7.0,
  ARG: 9.0,
  BRA: 9.0,
  GER: 13.0,
  POR: 13.0,
  NED: 19.0,
  NOR: 26.0,
  BEL: 34.0,
  COL: 41.0,
  USA: 51.0,
  MAR: 51.0,
  JPN: 67.0,
  SUI: 67.0,
  CRO: 81.0,
  MEX: 81.0,
  URU: 81.0,
  ECU: 101.0,
  SEN: 101.0,
};

export const POINTS_CONFIG = {
  EXACT_SCORE: 3,
  CORRECT_RESULT: 2,
  CORRECT_GOAL: 1,
} as const;

export const PHASE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Fase de Grupos',
  ROUND_OF_32: 'Dieciseisavos de Final',
  ROUND_OF_16: 'Octavos de Final',
  QUARTER_FINALS: 'Cuartos de Final',
  SEMI_FINALS: 'Semifinales',
  THIRD_PLACE: 'Tercer Lugar',
  FINAL: 'Final',
};

export const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Programado',
  LOCKED: 'Cerrado',
  LIVE: 'En Vivo',
  HALFTIME: 'Medio Tiempo',
  FINISHED: 'Finalizado',
  POSTPONED: 'Postergado',
  CANCELLED: 'Cancelado',
};

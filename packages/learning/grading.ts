import type { Direction, Rating } from '../contracts/index.ts';

export interface Opportunity {
  id: string;
  senseId: string;
  direction: Direction;
  policyVersion: string;
  allowTransliteration: boolean;
  /** Unicode script name from the trusted language pack, e.g. Hangul or Latin. */
  targetScript: string;
  hintUsed: boolean;
  status: 'open' | 'assessed';
}
export interface AssessmentProposal {
  opportunityId: string;
  senseId: string;
  direction: Direction;
  policyVersion: string;
  evidence: string;
  outcome: 'correct' | 'incorrect' | 'uncertain';
  answerForm: 'native_script' | 'transliteration' | 'mixed';
  explanation: string;
}
export type GradeDecision = { status: 'clarify'; reason: 'uncertain' | 'format_mismatch' }
  | { status: 'accepted'; rating: Rating; proposal: AssessmentProposal };

/** Validates model output, not semantic truth. Ownership is checked at the application boundary. */
export function acceptGrade(opportunity: Opportunity, message: string, raw: unknown,
  difficulty?: 'hard' | 'easy'): GradeDecision {
  if (opportunity.status !== 'open') throw new Error('Opportunity is closed');
  if (difficulty !== undefined && difficulty !== 'hard' && difficulty !== 'easy') throw new Error('Invalid difficulty');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid assessment schema');
  const p = raw as Record<string, unknown>;
  const fields = ['opportunityId', 'senseId', 'direction', 'policyVersion', 'evidence', 'outcome', 'answerForm', 'explanation'];
  if (Object.keys(p).some(k => !fields.includes(k)) || fields.some(k => typeof p[k] !== 'string')) {
    throw new Error('Invalid assessment schema');
  }
  if (p.opportunityId !== opportunity.id || p.senseId !== opportunity.senseId ||
      p.direction !== opportunity.direction || p.policyVersion !== opportunity.policyVersion) {
    throw new Error('Assessment does not match opportunity');
  }
  if (!['correct', 'incorrect', 'uncertain'].includes(p.outcome as string) ||
      !['native_script', 'transliteration', 'mixed'].includes(p.answerForm as string)) throw new Error('Invalid outcome');
  if (!(p.evidence as string).trim() || !message.includes(p.evidence as string) || !(p.explanation as string).trim()) {
    throw new Error('Missing or invented evidence');
  }
  const proposal = { ...p } as unknown as AssessmentProposal;
  // In reverse mode an English answer is expected; Latin script is not a mismatch.
  if (opportunity.direction === 'source_to_target' && !opportunity.allowTransliteration) {
    if (!/^[A-Za-z_]+$/.test(opportunity.targetScript)) throw new Error('Invalid target script policy');
    const script = new RegExp(`\\p{Script=${opportunity.targetScript}}`, 'u');
    if (p.answerForm === 'transliteration' || !script.test(p.evidence as string)) {
      return { status: 'clarify', reason: 'format_mismatch' };
    }
  }
  if (p.outcome === 'uncertain') return { status: 'clarify', reason: 'uncertain' };
  const rating: Rating = p.outcome === 'incorrect' || opportunity.hintUsed ? 'again' : difficulty ?? 'good';
  return { status: 'accepted', rating, proposal };
}

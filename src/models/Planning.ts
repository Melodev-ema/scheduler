import {WEEKDAYS} from "@/server/domain/planning/days";
import mongoose from 'mongoose';
import {ScheduleInterface, ScheduleSchema} from "@/models/Schedule";
import {LunchBreak} from "@/server/domain/planning/lunchBreak";
import {LunchBreakSchema} from "@/models/LunchBreakSchema";
import {Sacrifice} from "@/server/domain/planning/parseSchedule";

/** Forme d'une activité figée dans un instantané de planning. */
export interface PlannedActivity {
    name: string;
    description: string;
    priority: number;
    startTime: string;
    endTime: string;
    sessions?: number;
    sessionMinutes?: number;
    minSessionMinutes?: number;
    /** Anciens instantanés seulement, antérieurs au passage en minutes. */
    timeToSpendHours?: number;
    days: string[];
    source?: string;
    externalId?: string;
}

export interface PlanningInterface {
    _id: string;
    name: string;
    days: string[];
    activities: PlannedActivity[];
    schedule: ScheduleInterface[];
    /** Règles que le modèle n'a pas respectées ; absent sur les anciens plannings. */
    violations?: string[];
    sacrifices?: Sacrifice[];
    /** Explication des choix par le modèle ; absente sur les anciens plannings. */
    note?: string;
    /** Pause au moment de la génération ; `null` sans pause, absente sur les anciens plannings. */
    lunchBreak?: LunchBreak | null;
    /** Lundi 00:00 (heure locale) de la semaine du planning ; absent avant le rattrapage. */
    weekStart?: Date | string;
    timestamp: Date;
}

/**
 * Copie de ce qui a réellement été soumis au modèle : activités et tâches
 * externes déjà fusionnées. Distinct d'ActivitySchema, qui décrit une activité
 * vivante — ici rien n'est modifiable, et `source` / `externalId` disent d'où
 * venait chaque entrée. `_id: false` : ces copies ne sont pas adressables.
 */
const PlannedActivitySchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, default: ""},
    priority: {type: Number, default: 2},
    startTime: {type: String, default: ""},
    endTime: {type: String, default: ""},
    sessions: Number,
    sessionMinutes: Number,
    minSessionMinutes: Number,
    timeToSpendHours: Number,
    days: {type: [String], enum: WEEKDAYS, default: []},
    source: String,
    externalId: String,
}, {_id: false});

const SacrificeSchema = new mongoose.Schema({
    activity: {type: String, required: true},
    day: {type: String, default: ""},
    type: {type: String, enum: ['supprimée', 'raccourcie', 'écartée'], required: true},
    detail: {type: String, default: ""},
}, {_id: false});

const PlanningSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    days: [String],
    activities: [PlannedActivitySchema],
    schedule: [ScheduleSchema],
    violations: {type: [String], default: []},
    sacrifices: {type: [SacrificeSchema], default: []},
    note: {type: String, default: ""},
    // Pas de default : absent = ancien planning (pause par défaut), null = pas de pause.
    lunchBreak: {type: LunchBreakSchema},
    // Pas de `required` : les anciens plannings l'obtiennent par `backfillWeekStart`.
    weekStart: {type: Date, index: true},
    timestamp: {type: Date, default: Date.now},
});

export default mongoose.models.Planning || mongoose.model('Planning', PlanningSchema);
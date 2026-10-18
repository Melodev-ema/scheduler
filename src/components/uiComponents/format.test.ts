import {describe, expect, it} from "vitest";
import {formatWeekRange} from "./format";

describe("formatWeekRange", () => {
    it("écrit le mois une fois quand la semaine tient dans un mois", () => {
        expect(formatWeekRange(new Date(2026, 9, 19))).toBe("lundi 19 au dimanche 25 octobre");
    });

    it("écrit les deux mois quand la semaine en chevauche deux", () => {
        expect(formatWeekRange(new Date(2026, 9, 26))).toBe("lundi 26 octobre au dimanche 1 novembre");
    });
});

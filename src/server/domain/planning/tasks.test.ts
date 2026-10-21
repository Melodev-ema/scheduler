import {describe, expect, it} from 'vitest';
import {remainingWeekdays} from '@/server/domain/planning/days';
import {DEFAULT_TASK_PRIORITY, taskToPlannable} from '@/server/domain/planning/tasks';
import {EXTERNAL_TASK_DEFAULT_MINUTES} from '@/server/domain/planning/mergeTasks';

/** Mercredi 30 septembre 2026, 15 h : l'heure ne doit rien changer au calcul. */
const NOW = new Date(2026, 8, 30, 15, 0);

describe('remainingWeekdays', () => {
    it('va du jour donné à dimanche', () => {
        expect(remainingWeekdays(NOW)).toEqual(['mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']);
    });

    it('ne garde que dimanche un dimanche', () => {
        expect(remainingWeekdays(new Date(2026, 9, 4))).toEqual(['dimanche']);
    });
});

describe('taskToPlannable', () => {
    it('applique les valeurs par défaut à une tâche réduite à son titre', () => {
        expect(taskToPlannable({title: 'Appeler le plombier'}, NOW, 't1')).toEqual({
            name: 'Appeler le plombier',
            description: '',
            priority: DEFAULT_TASK_PRIORITY,
            startTime: '',
            endTime: '',
            sessionMinutes: EXTERNAL_TASK_DEFAULT_MINUTES,
            timesPerWeek: 1,
            days: ['mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
            ref: 't1',
        });
    });

    it('borne les jours par une échéance dans la semaine', () => {
        const task = taskToPlannable({title: 'Impôts', priority: 3, dueDate: new Date(Date.UTC(2026, 9, 2))}, NOW, 't1');
        expect(task.days).toEqual(['mercredi', 'jeudi', 'vendredi']);
        expect(task.priority).toBe(3);
    });

    it('accepte une échéance en chaîne ISO', () => {
        expect(taskToPlannable({title: 'Impôts', dueDate: '2026-10-02'}, NOW, 't1').days)
            .toEqual(['mercredi', 'jeudi', 'vendredi']);
    });

    it('passe en priorité 1 le jour de l\'échéance, sur ce seul jour', () => {
        const task = taskToPlannable({title: 'Impôts', priority: 3, dueDate: new Date(Date.UTC(2026, 8, 30))}, NOW, 't1');
        expect(task.priority).toBe(1);
        expect(task.days).toEqual(['mercredi']);
    });

    it('passe en priorité 1 une tâche en retard, placée à partir d\'aujourd\'hui', () => {
        const task = taskToPlannable({title: 'Impôts', priority: 3, dueDate: new Date(Date.UTC(2026, 8, 28))}, NOW, 't1');
        expect(task.priority).toBe(1);
        expect(task.days).toEqual(['mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']);
    });

    it('garde la priorité saisie pour une échéance lointaine, sur tous les jours restants', () => {
        const task = taskToPlannable({title: 'Passeport', priority: 2, dueDate: new Date(Date.UTC(2026, 9, 5))}, NOW, 't1');
        expect(task.priority).toBe(2);
        expect(task.days).toEqual(['mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']);
    });

    it('borne une échéance au dimanche du passage à l\'heure d\'hiver', () => {
        const saturday = new Date(2026, 9, 24, 15, 0);
        expect(taskToPlannable({title: 'Impôts', dueDate: '2026-10-25'}, saturday, 't1').days)
            .toEqual(['samedi', 'dimanche']);
    });

    it('ouvre toute la fin de semaine à une échéance juste après le passage à l\'heure d\'hiver', () => {
        const saturday = new Date(2026, 9, 24, 15, 0);
        expect(taskToPlannable({title: 'Impôts', dueDate: '2026-10-26'}, saturday, 't1').days)
            .toEqual(['samedi', 'dimanche']);
    });

    it('compte un jour d\'échéance sur une journée de 23 h, au passage à l\'heure d\'été', () => {
        const saturday = new Date(2027, 2, 27, 15, 0);
        const task = taskToPlannable({title: 'Impôts', priority: 3, dueDate: '2027-03-28'}, saturday, 't1');
        expect(task.days).toEqual(['samedi', 'dimanche']);
        expect(task.priority).toBe(3);
    });

    it('garde le créneau d\'une tâche fixe', () => {
        const task = taskToPlannable({title: 'Dentiste', startTime: '10:00', endTime: '10:45'}, NOW, 't2');
        expect(task).toMatchObject({startTime: '10:00', endTime: '10:45', ref: 't2'});
    });

    it('tronque un titre trop long pour le prompt', () => {
        expect(taskToPlannable({title: 'x'.repeat(300)}, NOW, 't1').name).toHaveLength(201);
    });
});

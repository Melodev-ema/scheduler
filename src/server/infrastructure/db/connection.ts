import mongoose, {Mongoose} from 'mongoose';
import {getEnv} from '@/server/config/env';
import {backfillWeekStart} from '@/server/infrastructure/db/plannings';

interface CachedMongoose {
    conn: Mongoose | null;
    promise: Promise<Mongoose> | null;
    /** Le rattrapage de `weekStart` n'est lancé qu'une fois par processus. */
    backfilled?: boolean;
}

declare global {
    var mongoose: CachedMongoose | undefined;
}

global.mongoose = global.mongoose || {conn: null, promise: null};

const cached: CachedMongoose = global.mongoose;

async function connect(): Promise<Mongoose> {
    if (!cached.promise) {
        cached.promise = mongoose.connect(getEnv().mongodbUri);
    }

    cached.conn = await cached.promise;
    return cached.conn;
}

async function backfillOnce(): Promise<void> {
    if (cached.backfilled) {
        return;
    }
    cached.backfilled = true;
    try {
        const count = await backfillWeekStart();
        if (count > 0) {
            console.info(`weekStart rattrapé sur ${count} planning(s)`);
        }
    } catch (error) {
        // Un rattrapage raté ne doit jamais bloquer une requête.
        console.error('Rattrapage de weekStart échoué', error);
    }
}

async function dbConnect(): Promise<Mongoose> {
    const conn = cached.conn ?? await connect();
    await backfillOnce();
    return conn;
}

export default dbConnect;

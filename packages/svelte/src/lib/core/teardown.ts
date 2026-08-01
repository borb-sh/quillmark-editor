// The teardown order every surface holds: unregister, cancel, then free.
//
// An order rather than a list, because work is deferred: a surface that frees
// first leaves a scheduled continuation holding what nobody owns, and one that
// cancels first but stays registered still takes the next event.
//
// `Lifespan` carries it. A surface builds one, registers its cancellers in the
// order they must run, and ends the span once; continuations that cross an await
// ask `resumes()` rather than a flag they captured before it.

/** A surface's lifespan: alive from construction until {@link Lifespan.end}. */
export interface Lifespan {
	/** False once the span has ended. */
	readonly alive: boolean;
	/**
	 * Register work to undo at the end: a registry entry to drop, a timer or frame
	 * to cancel, a handle to free. Cancellers run in REGISTRATION order, which is
	 * where the order lives. Registering on an ended span runs the canceller at
	 * once: there is no later run to hold it for.
	 */
	onEnd(cancel: () => void): void;
	/**
	 * Await `pending`, then report whether the surface survived the window. `false`
	 * is a continuation to drop: what it captured before the await is gone.
	 */
	resumes(pending: Promise<unknown>): Promise<boolean>;
	/** Run the cancellers once and end the span. Idempotent. */
	end(): void;
}

export function createLifespan(): Lifespan {
	let alive = true;
	const cancels: (() => void)[] = [];
	return {
		get alive() {
			return alive;
		},
		onEnd(cancel) {
			if (!alive) return void cancel();
			cancels.push(cancel);
		},
		async resumes(pending) {
			await pending;
			return alive;
		},
		end() {
			if (!alive) return;
			// Dead BEFORE the cancellers run: one of them may synchronously reach
			// something that asks, and a span mid-teardown is not alive.
			alive = false;
			for (const cancel of cancels) cancel();
			cancels.length = 0;
		}
	};
}

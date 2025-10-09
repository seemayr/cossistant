export type EventHandlerRecord<TSchema extends Record<string, Record<string, unknown>>> =
	Partial<{
		[Namespace in keyof TSchema]: Partial<{
			[EventName in keyof TSchema[Namespace]]: (
				value: TSchema[Namespace][EventName]
			) => void;
		}>;
	}>;

export function hasEventHandlers<TSchema extends Record<string, Record<string, unknown>>>(
	handlers?: EventHandlerRecord<TSchema> | null,
): handlers is EventHandlerRecord<TSchema> {
	if (!handlers) {
		return false;
	}

	return Object.values(handlers).some((namespace) => {
		if (!namespace || typeof namespace !== "object") {
			return false;
		}

		return Object.values(namespace).some(
			(handler): handler is (...args: unknown[]) => void =>
				typeof handler === "function",
		);
	});
}

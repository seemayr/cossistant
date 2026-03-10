import { DEFAULT_GLOBE_CLUSTERING } from "../defaults";
import type { GlobeCluster, GlobeClusteringOptions } from "../types";
import type { NormalizedPin } from "./pins";

export type GlobeRenderItem =
	| {
			kind: "pin";
			key: string;
			pin: NormalizedPin;
	  }
	| {
			kind: "cluster";
			key: string;
			cluster: GlobeCluster;
	  };

export function resolveRenderItems(
	pins: NormalizedPin[],
	clustering: false | GlobeClusteringOptions | undefined
) {
	if (!clustering) {
		return pins.map((pin) => ({
			kind: "pin" as const,
			key: pin.id,
			pin,
		}));
	}

	const options = {
		...DEFAULT_GLOBE_CLUSTERING,
		...clustering,
	};

	const clusterablePins = pins.filter((pin) => pin.clusterable);
	const fixedPins = pins.filter((pin) => !pin.clusterable);
	const shouldCluster =
		options.mode === "always" || clusterablePins.length > options.threshold;

	if (!shouldCluster) {
		return pins.map((pin) => ({
			kind: "pin" as const,
			key: pin.id,
			pin,
		}));
	}

	const items: GlobeRenderItem[] = fixedPins.map((pin) => ({
		kind: "pin",
		key: pin.id,
		pin,
	}));

	const buckets = new Map<string, NormalizedPin[]>();

	for (const pin of clusterablePins) {
		const key = getGeoGridBucketKey(
			pin.latitude,
			pin.longitude,
			options.cellDegrees
		);
		const bucket = buckets.get(key);
		if (bucket) {
			bucket.push(pin);
		} else {
			buckets.set(key, [pin]);
		}
	}

	for (const [bucketKey, members] of buckets) {
		const [singleMember] = members;
		if (members.length === 1 && singleMember) {
			items.push({
				kind: "pin",
				key: singleMember.id,
				pin: singleMember,
			});
			continue;
		}

		const count = members.reduce((total, member) => total + member.weight, 0);
		const latitude =
			members.reduce((total, member) => total + member.latitude, 0) /
			members.length;
		const longitude =
			members.reduce(
				(total, member) => total + normalizeLongitude(member.longitude),
				0
			) / members.length;

		items.push({
			kind: "cluster",
			key: `cluster:${bucketKey}`,
			cluster: {
				id: `cluster:${bucketKey}`,
				latitude,
				longitude,
				count,
				pinCount: members.length,
				members,
			},
		});
	}

	return items;
}

function getGeoGridBucketKey(
	latitude: number,
	longitude: number,
	cellDegrees: number
) {
	const normalizedLatitude = clamp(latitude, -90, 90);
	const normalizedLongitude = normalizeLongitude(longitude);
	const latBucket = Math.floor((normalizedLatitude + 90) / cellDegrees);
	const lngBucket = Math.floor((normalizedLongitude + 180) / cellDegrees);
	return `${latBucket}:${lngBucket}`;
}

function normalizeLongitude(longitude: number) {
	return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

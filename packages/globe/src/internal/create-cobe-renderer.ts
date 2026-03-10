import Phenomenon from "phenomenon";
import type { GlobeConfig, GlobeMarker } from "../types";

// Vendored and adapted from shuding/cobe (MIT).

const OPT_PHI = "phi";
const OPT_THETA = "theta";
const OPT_DOTS = "mapSamples";
const OPT_MAP_BRIGHTNESS = "mapBrightness";
const OPT_BASE_COLOR = "baseColor";
const OPT_MARKER_COLOR = "markerColor";
const OPT_GLOW_COLOR = "glowColor";
const OPT_MARKERS = "markers";
const OPT_DIFFUSE = "diffuse";
const OPT_DPR = "devicePixelRatio";
const OPT_DARK = "dark";
const OPT_OFFSET = "offset";
const OPT_SCALE = "scale";
const OPT_OPACITY = "opacity";
const OPT_MAP_BASE_BRIGHTNESS = "mapBaseBrightness";

const UNIFORM_RESOLUTION = "w";
const UNIFORM_PHI = "z";
const UNIFORM_THETA = "A";
const UNIFORM_DOTS = "k";
const UNIFORM_DOTS_BRIGHTNESS = "D";
const UNIFORM_BASE_COLOR = "S";
const UNIFORM_MARKER_COLOR = "T";
const UNIFORM_GLOW_COLOR = "y";
const UNIFORM_MARKERS = "u";
const UNIFORM_MARKERS_NUM = "C";
const UNIFORM_DIFFUSE = "E";
const UNIFORM_DARK = "F";
const UNIFORM_OFFSET = "x";
const UNIFORM_SCALE = "B";
const UNIFORM_OPACITY = "U";
const UNIFORM_MAP_BASE_BRIGHTNESS = "G";
const UNIFORM_TEXTURE = "H";

const OPTION_TO_UNIFORM = {
	[OPT_PHI]: UNIFORM_PHI,
	[OPT_THETA]: UNIFORM_THETA,
	[OPT_DOTS]: UNIFORM_DOTS,
	[OPT_MAP_BRIGHTNESS]: UNIFORM_DOTS_BRIGHTNESS,
	[OPT_BASE_COLOR]: UNIFORM_BASE_COLOR,
	[OPT_MARKER_COLOR]: UNIFORM_MARKER_COLOR,
	[OPT_GLOW_COLOR]: UNIFORM_GLOW_COLOR,
	[OPT_DIFFUSE]: UNIFORM_DIFFUSE,
	[OPT_DARK]: UNIFORM_DARK,
	[OPT_OFFSET]: UNIFORM_OFFSET,
	[OPT_SCALE]: UNIFORM_SCALE,
	[OPT_OPACITY]: UNIFORM_OPACITY,
	[OPT_MAP_BASE_BRIGHTNESS]: UNIFORM_MAP_BASE_BRIGHTNESS,
} as const;

const GLOBE_TEXTURE =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAACAAQAAAADMzoqnAAAAAXNSR0IArs4c6QAABA5JREFUeNrV179uHEUAx/Hf3JpbF+E2VASBsmVKTBcpKJs3SMEDcDwBiVJAAewYEBUivIHT0uUBIt0YCovKD0CRjUC4QfHYh8hYXu+P25vZ2Zm9c66gMd/GJ/tz82d3bk8GN4SrByYF2366FNTACIAkivVAAazQdnf3MvAlbNUQfOPAdQDvSAimMWhwy4I2g4SU+Kp04ISLpPBAKLxPyic3O/CCi+Y7rUJbiodcpDOFY7CgxCEXmdYD2EYK2s5lApOx5pEDDYCUwM1XdJUwBV11QQMg59kePSCaPAASQMEL2hwo6TJFgxpg+TgC2ymXPbuvc40awr3D1QCFfbH9kcoqAOkZozpQo0aqAGQRKCog/+tjkgbNFEtg2FffBvBGlSxHoAaAa1u6X4PBAwDiR8FFsrQgeUhfJTSALaB9jy5NCybJPn1SVFiWk7ywN+KzhH1aKAuydhGkbEF4lWohLXDXavlyFgHY7LBnLRdlAP6BS5Cc8RfVDXbkwN/oIvmY+6obbNeBP0JwTuMGu9gTzy1Q4RS/cWpfzszeYwd+CAFrtBW/Hur0gLbJGlD+/OjVwe/drfBxkbbg63dndEDfiEBlAd7ac0BPe1D6Jd8dfbLH+RI0OzseFB5s01/M+gMdAeluLOCAuaUA9Lezo/vSgXoCX9rtEiXnp7Q1W/CNyWcd8DXoS6jH/YZ5vAJEWY2dXFQe2TUgaFaNejCzJ98g6HnlVrsE58sDcYqg+9XY75fPqdoh/kRQWiXKg8MWlJQxUFMPjqnyujhFBE7UxIMjyszk0QwQlFsezImsyvUYYYVED2pk6m0Tg8T04Fwjk2kdAwSACqlM6gRRt3vQYAFGX0Ah7Ebx1H+MDRI5ui0QldH4j7FGcm90XdxD2Jg1AOEAVAKhEFXSn4cKUELurIAKwJ3MArypPscQaLhJFICJ0ohjDySAdH8AhDtCiTuMycH8CXzhH9jUACAO5uMhoAwA5i+T6WAKmmAqnLy80wxHqIPFYpqCwxGaYLt4Dyievg5kEoVEUAhs6pqKgFtDQYOuaXypaWKQfIuwwoGSZgfLsu/XAtI8cGN+h7Cc1A5oLOMhwlIPXuhu48AIvsSBkvtV9wsJRKCyYLfq5lTrQMFd1a262oqBck9K1V0YjQg0iEYYgpS1A9GlXQV5cykwm4A7BzVsxQqo7E+zCegO7Ma7yKgsuOcfKbMBwLC8wvVNYDsANYalEpOAa6zpWjTeMKGwEwC1CiQewJc5EKfgy7GmRAZA4vUVGwE2dPM/g0xuAInE/yG5aZ8ISxWGfYigUVbdyBElTHh2uCwGdfCkOLGgQVBh3Ewp+/QK4CDlR5Ws/Zf7yhCf8pH7vinWAvoVCQ6zz0NX5V/6GkAVV+2/5qsJ/gU8bsxpM8IeAQAAAABJRU5ErkJggg==";

const FRAGMENT_SHADER =
	"precision highp float;uniform vec2 w,x;uniform vec3 S,T,y;uniform vec4 u[64*2];uniform float z,A,k,B,C,D,E,F,U,G;uniform sampler2D H;float I=1./k;mat3 J(float a,float b){float c=cos(a),d=cos(b),e=sin(a),f=sin(b);return mat3(d,f*e,-f*c,0.,c,e,f,d*-e,d*c);}vec3 K(vec3 c,out float v){c=c.xzy;float p=max(2.,floor(log2(2.236068*k*3.141593*(1.-c.z*c.z))*.72021));vec2 g=floor(pow(1.618034,p)/2.236068*vec2(1,1.618034)+.5),d=fract((g+1.)*.618034)*6.283185-3.883222,e=-2.*g,f=vec2(atan(c.y,c.x),c.z-1.),q=floor(vec2(e.y*f.x-d.y*(f.y*k+1.),-e.x*f.x+d.x*(f.y*k+1.))/(d.x*e.y-e.x*d.y));float n=3.141593;vec3 r;for(float h=0.;h<4.;h+=1.){vec2 s=vec2(mod(h,2.),floor(h*.5));float j=dot(g,q+s);if(j>k)continue;float a=j,b=0.;if(a>=524288.)a-=524288.,b+=.803894;if(a>=262144.)a-=262144.,b+=.901947;if(a>=131072.)a-=131072.,b+=.950973;if(a>=65536.)a-=65536.,b+=.475487;if(a>=32768.)a-=32768.,b+=.737743;if(a>=16384.)a-=16384.,b+=.868872;if(a>=8192.)a-=8192.,b+=.934436;if(a>=4096.)a-=4096.,b+=.467218;if(a>=2048.)a-=2048.,b+=.733609;if(a>=1024.)a-=1024.,b+=.866804;if(a>=512.)a-=512.,b+=.433402;if(a>=256.)a-=256.,b+=.216701;if(a>=128.)a-=128.,b+=.108351;if(a>=64.)a-=64.,b+=.554175;if(a>=32.)a-=32.,b+=.777088;if(a>=16.)a-=16.,b+=.888544;if(a>=8.)a-=8.,b+=.944272;if(a>=4.)a-=4.,b+=.472136;if(a>=2.)a-=2.,b+=.236068;if(a>=1.)a-=1.,b+=.618034;float l=fract(b)*6.283185,i=1.-2.*j*I,m=sqrt(1.-i*i);vec3 o=vec3(cos(l)*m,sin(l)*m,i);float t=length(c-o);if(t<n)n=t,r=o;}v=n;return r.xzy;}void main(){vec2 f=1./w,a=(gl_FragCoord.xy*f*2.-1.)/B-x*vec2(1,-1)*f;a.x*=w.x*f.y;float c=dot(a,a);vec4 t=vec4(0);float j=0.;int V=int(C);if(c<=.64){float b;vec4 e=vec4(0);vec3 v=vec3(0,0,1),l=normalize(vec3(a,sqrt(.64-c)));mat3 L=J(A,z);float g=dot(l,v);vec3 m=l*L,h=K(m,b);float n=asin(h.y),i=acos(-h.x/cos(n));i=h.z<0.?-i:i;float M=max(texture2D(H,vec2(i*.5/3.141593,-(n/3.141593+.5))).x,G),N=smoothstep(8e-3,0.,b),o=pow(g,E)*D,p=M*N*o,W=mix((1.-p)*pow(g,.4),p,F)+.1;e+=vec4(S*W,1.);float X=0.;for(int d=0;d<128;d+=2){if(d>=V)break;vec4 q=u[d],O=u[d+1];vec3 P=q.xyz;float r=q.w;vec3 Y=P-m;b=length(Y);if(b<r){float Q=r*.5,s=smoothstep(Q,0.,b);X+=s,e.xyz=O.w>.5?mix(e.xyz,O.xyz,s*o):mix(e.xyz,T,s*o);}}e.xyz+=pow(1.-g,4.)*y,t+=e*(1.+U)*.5,j=pow(dot(normalize(vec3(-a,sqrt(1.-c))),vec3(0,0,1)),4.)*smoothstep(0.,1.,.2/(c-.64));}else{float R=sqrt(.2/(c-.64));j=smoothstep(.5,1.,R/(R+1.));}gl_FragColor=t+vec4(j*y,j);}";

const { PI, sin, cos, sqrt, atan2, floor, max, pow, log2 } = Math;

const SQRT_5 = 2.236_067_977_499_79;
const GOLDEN_RATIO = 1.618_033_988_749_895;
const INV_LOG_PHI_PLUS_ONE = 0.720_210_045_206_278_3;
const TAU = 6.283_185_307_179_586;
const TWO_PI_OVER_PHI = 3.883_222_077_450_932_7;
const PHI_MINUS_ONE = 0.618_033_988_749_895;

export interface CobeRendererState
	extends Partial<GlobeConfig>,
		Record<string, unknown> {
	width?: number;
	height?: number;
	markers?: GlobeMarker[];
}

export interface CobeRendererOptions extends GlobeConfig {
	width: number;
	height: number;
	onRender?: (state: CobeRendererState) => CobeRendererState | undefined;
}

type RendererUniform = {
	type: string;
	value: number | number[];
};

type PhenomenonUniformMap = Record<string, RendererUniform>;

type PhenomenonRenderable = {
	vertex: string;
	fragment: string;
	uniforms: PhenomenonUniformMap;
	mode: number;
	geometry: {
		vertices: Array<{ x: number; y: number; z: number }>;
	};
	onRender: (args: { uniforms: PhenomenonUniformMap }) => void;
};

type PhenomenonInstance = {
	add: (name: string, renderable: PhenomenonRenderable) => void;
	destroy: () => void;
};

type PhenomenonConstructor = new (options: {
	canvas: HTMLCanvasElement;
	contextType: "webgl2" | "webgl" | "experimental-webgl";
	context: WebGLContextAttributes;
	settings: {
		devicePixelRatio: number;
		onSetup: (gl: WebGLRenderingContext) => void;
	};
}) => PhenomenonInstance;

const nearestFibonacciLattice = (
	point: readonly [number, number, number],
	dots: number
) => {
	const query = [point[0], point[2], point[1]] as const;
	const dotsReciprocal = 1 / dots;
	const latticeOrder = max(
		2,
		floor(
			log2(SQRT_5 * dots * PI * (1 - query[2] * query[2])) *
				INV_LOG_PHI_PLUS_ONE
		)
	);
	const phiPower = pow(GOLDEN_RATIO, latticeOrder) / SQRT_5;
	const fibonacciPair = [
		floor(phiPower + 0.5),
		floor(phiPower * GOLDEN_RATIO + 0.5),
	] as const;
	const rhombusBasis = [
		(((fibonacciPair[0] + 1) * PHI_MINUS_ONE) % 1) * TAU - TWO_PI_OVER_PHI,
		(((fibonacciPair[1] + 1) * PHI_MINUS_ONE) % 1) * TAU - TWO_PI_OVER_PHI,
	] as const;
	const rhombusOffset = [-2 * fibonacciPair[0], -2 * fibonacciPair[1]] as const;
	const sphericalPoint = [atan2(query[1], query[0]), query[2] - 1] as const;
	const determinant =
		rhombusBasis[0] * rhombusOffset[1] - rhombusOffset[0] * rhombusBasis[1];
	const cell = [
		floor(
			(rhombusOffset[1] * sphericalPoint[0] -
				rhombusBasis[1] * (sphericalPoint[1] * dots + 1)) /
				determinant
		),
		floor(
			(-rhombusOffset[0] * sphericalPoint[0] +
				rhombusBasis[0] * (sphericalPoint[1] * dots + 1)) /
				determinant
		),
	] as const;

	let minDistance = PI;
	let nearestPoint: [number, number, number] = [0, 0, 0];

	for (let step = 0; step < 4; step += 1) {
		const sampleIndex =
			fibonacciPair[0] * (cell[0] + (step % 2)) +
			fibonacciPair[1] * (cell[1] + floor(step * 0.5));
		if (sampleIndex > dots) {
			continue;
		}

		const theta = ((sampleIndex * PHI_MINUS_ONE) % 1) * TAU;
		const zValue = 1 - 2 * sampleIndex * dotsReciprocal;
		const radius = sqrt(1 - zValue * zValue);
		const samplePoint: [number, number, number] = [
			cos(theta) * radius,
			sin(theta) * radius,
			zValue,
		];
		const distance = sqrt(
			(query[0] - samplePoint[0]) ** 2 +
				(query[1] - samplePoint[1]) ** 2 +
				(query[2] - samplePoint[2]) ** 2
		);
		if (distance < minDistance) {
			minDistance = distance;
			nearestPoint = samplePoint;
		}
	}

	return [nearestPoint[0], nearestPoint[2], nearestPoint[1]] as const;
};

const mapMarkers = (markers: GlobeMarker[], dots: number) => [
	...markers.flatMap((marker) => {
		let [latitude, longitude] = marker.location;
		latitude = (latitude * PI) / 180;
		longitude = (longitude * PI) / 180 - PI;
		const cosLatitude = cos(latitude);
		const point: [number, number, number] = [
			-cosLatitude * cos(longitude),
			sin(latitude),
			cosLatitude * sin(longitude),
		];
		const snappedPoint = nearestFibonacciLattice(point, dots);
		return [
			...snappedPoint,
			marker.size,
			...(marker.color ? [...marker.color, 1] : [0, 0, 0, 0]),
		];
	}),
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
];

export function createCobeRenderer(
	canvas: HTMLCanvasElement,
	options: CobeRendererOptions
) {
	const PhenomenonRenderer = Phenomenon as unknown as PhenomenonConstructor;
	const createUniform = (
		type: string,
		name: keyof GlobeConfig,
		fallback?: number | number[]
	): RendererUniform => ({
		type,
		value:
			typeof options[name] === "undefined"
				? (fallback as number | number[])
				: (options[name] as number | number[]),
	});

	const contextType = canvas.getContext("webgl2")
		? "webgl2"
		: canvas.getContext("webgl")
			? "webgl"
			: "experimental-webgl";

	const renderer = new PhenomenonRenderer({
		canvas,
		contextType,
		context: {
			alpha: true,
			stencil: false,
			antialias: true,
			depth: false,
			preserveDrawingBuffer: false,
			...options.context,
		},
		settings: {
			[OPT_DPR]: options[OPT_DPR] || 1,
			onSetup: (gl: WebGLRenderingContext) => {
				const texture = gl.createTexture();
				if (!texture) {
					return;
				}

				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGB,
					1,
					1,
					0,
					gl.RGB,
					gl.UNSIGNED_BYTE,
					new Uint8Array([0, 0, 0, 0])
				);

				const image = new Image();
				image.onload = () => {
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGB,
						gl.RGB,
						gl.UNSIGNED_BYTE,
						image
					);
					gl.generateMipmap(gl.TEXTURE_2D);
					const program = gl.getParameter(gl.CURRENT_PROGRAM);
					const textureLocation = gl.getUniformLocation(
						program,
						UNIFORM_TEXTURE
					);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					gl.uniform1i(textureLocation, 0);
				};
				image.src = GLOBE_TEXTURE;
			},
		},
	});

	const rendererUniforms: PhenomenonUniformMap = {
		[UNIFORM_RESOLUTION]: {
			type: "vec2",
			value: [options.width, options.height],
		},
		[UNIFORM_PHI]: createUniform("float", OPT_PHI),
		[UNIFORM_THETA]: createUniform("float", OPT_THETA),
		[UNIFORM_DOTS]: createUniform("float", OPT_DOTS),
		[UNIFORM_DOTS_BRIGHTNESS]: createUniform("float", OPT_MAP_BRIGHTNESS),
		[UNIFORM_MAP_BASE_BRIGHTNESS]: createUniform(
			"float",
			OPT_MAP_BASE_BRIGHTNESS
		),
		[UNIFORM_BASE_COLOR]: createUniform("vec3", OPT_BASE_COLOR),
		[UNIFORM_MARKER_COLOR]: createUniform("vec3", OPT_MARKER_COLOR),
		[UNIFORM_DIFFUSE]: createUniform("float", OPT_DIFFUSE),
		[UNIFORM_GLOW_COLOR]: createUniform("vec3", OPT_GLOW_COLOR),
		[UNIFORM_DARK]: createUniform("float", OPT_DARK),
		[UNIFORM_MARKERS]: {
			type: "vec4",
			value: mapMarkers(options[OPT_MARKERS], options[OPT_DOTS]),
		},
		[UNIFORM_MARKERS_NUM]: {
			type: "float",
			value: options[OPT_MARKERS].length * 2,
		},
		[UNIFORM_OFFSET]: createUniform("vec2", OPT_OFFSET, [0, 0]),
		[UNIFORM_SCALE]: createUniform("float", OPT_SCALE, 1),
		[UNIFORM_OPACITY]: createUniform("float", OPT_OPACITY, 1),
	};

	const geometry = {
		vertices: [
			{ x: -100, y: 100, z: 0 },
			{ x: -100, y: -100, z: 0 },
			{ x: 100, y: 100, z: 0 },
			{ x: 100, y: -100, z: 0 },
			{ x: -100, y: -100, z: 0 },
			{ x: 100, y: 100, z: 0 },
		],
	};

	renderer.add("", {
		vertex:
			"attribute vec3 aPosition;uniform mat4 uProjectionMatrix;uniform mat4 uModelMatrix;uniform mat4 uViewMatrix;void main(){gl_Position=uProjectionMatrix*uModelMatrix*uViewMatrix*vec4(aPosition,1.);}",
		fragment: FRAGMENT_SHADER,
		uniforms: rendererUniforms,
		mode: 4,
		geometry,
		onRender: ({ uniforms }: { uniforms: PhenomenonUniformMap }) => {
			let state: CobeRendererState = {};

			if (options.onRender) {
				state = options.onRender(state) ?? state;

				for (const optionName of Object.keys(OPTION_TO_UNIFORM) as Array<
					keyof typeof OPTION_TO_UNIFORM
				>) {
					const key = optionName;
					const nextValue = state[key];
					const uniformName = OPTION_TO_UNIFORM[key];
					if (nextValue !== undefined && uniformName) {
						const uniform = uniforms[uniformName];
						if (uniform) {
							uniform.value = nextValue as number | number[];
						}
					}
				}

				const nextMarkers = state[OPT_MARKERS] as GlobeMarker[] | undefined;
				const nextDots = state[OPT_DOTS] as number | undefined;

				if (nextMarkers) {
					const dotsValue =
						nextDots ??
						((uniforms[UNIFORM_DOTS]?.value ?? options[OPT_DOTS]) as number);
					const markerUniform = uniforms[UNIFORM_MARKERS];
					if (markerUniform) {
						markerUniform.value = mapMarkers(nextMarkers, dotsValue);
					}
					const markerCountUniform = uniforms[UNIFORM_MARKERS_NUM];
					if (markerCountUniform) {
						markerCountUniform.value = nextMarkers.length * 2;
					}
				}

				if (state.width !== undefined && state.height !== undefined) {
					const resolutionUniform = uniforms[UNIFORM_RESOLUTION];
					if (resolutionUniform) {
						resolutionUniform.value = [state.width, state.height];
					}
				}

				if (nextDots !== undefined) {
					const markers = nextMarkers ?? options[OPT_MARKERS];
					const markerUniform = uniforms[UNIFORM_MARKERS];
					if (markerUniform) {
						markerUniform.value = mapMarkers(markers, nextDots);
					}
				}
			}
		},
	});

	return renderer;
}

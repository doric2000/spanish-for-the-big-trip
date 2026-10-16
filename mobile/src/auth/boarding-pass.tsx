import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Circle, Defs, G, Path, Rect } from 'react-native-svg';
import { D1Mark, Grain, Plane } from '../retro/art';
import { retro } from '../theme';

// The sign-in "ticket": a retro travel poster printed on a boarding pass
// (Claude Design prototype, artboard SignInAB, approved by Dor 2026-10-16).
// Everything here is decoration; the screen's text and buttons live outside it.
const c = retro.colors;
const f = retro.fonts;

// The poster art is drawn in a 350x312 design space and scaled to cover the poster
// area, anchored at the bottom (like preserveAspectRatio "xMidYMax slice").
const ART_W = 350, ART_H = 312, SUN_X = 175, SUN_Y = 210;

export function BoardingPass({ dimmed }: { dimmed: boolean }) {
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) enter.value = withDelay(100, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [enter, reduceMotion]);
  const ticketStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 80 }, { rotate: `${-6 + enter.value * 4.8}deg` }],
  }));

  return <Animated.View style={[styles.ticket, ticketStyle, dimmed && styles.dimmed]}>
    <Poster reduceMotion={reduceMotion} />
    <Perforation />
    <Stub />
  </Animated.View>;
}

function Poster({ reduceMotion }: { reduceMotion: boolean }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const { w, h } = size;
  const s = Math.max(w / ART_W, h / ART_H) || 1;
  const ox = (w - ART_W * s) / 2, oy = h - ART_H * s;
  const art = { position: 'absolute' as const, left: ox, top: oy, width: ART_W * s, height: ART_H * s };
  const sunX = ox + SUN_X * s, sunY = oy + SUN_Y * s, rayR = 260 * s;

  const rays = useSharedValue(0), rise = useSharedValue(reduceMotion ? 1 : 0), waves = useSharedValue(0), flight = useSharedValue(0);
  const titles = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    rays.value = withRepeat(withTiming(1, { duration: 70000, easing: Easing.linear }), -1);
    rise.value = withDelay(300, withTiming(1, { duration: 1500, easing: Easing.out(Easing.cubic) }));
    waves.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.linear }), -1);
    flight.value = withDelay(1400, withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.quad) }), -1));
    titles.value = withDelay(550, withTiming(1, { duration: 700 }));
  }, [reduceMotion, rays, rise, waves, flight, titles]);

  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rays.value * 360}deg` }] }));
  const sunStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - rise.value) * 46 * s }] }));
  const wavesStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -waves.value * 48 * s }] }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titles.value, transform: [{ translateY: (1 - titles.value) * 16 }] }));
  // The plane flies right to left (from Hebrew towards Spanish) along a gentle curve.
  const planeStyle = useAnimatedStyle(() => {
    const t = flight.value;
    const x0 = w + 14, y0 = h * 0.42, cx = w * 0.5, cy = h * 0.08, x1 = -14, y1 = h * 0.30;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
    const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
    const fade = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
    return { opacity: reduceMotion ? 0 : fade, transform: [{ translateX: x - 11 }, { translateY: y - 11 }, { rotate: `${Math.atan2(dy, dx) - Math.PI}rad` }] };
  });

  // An even cream frame around the poster: the frame is a padded outer view and the art is
  // clipped by an inner window, so the cover-scaled art can never paint over the frame.
  return <View style={styles.posterFrame}><View style={styles.poster} onLayout={onLayout}>
    {/* Absolute art layers use left-to-right coordinates regardless of the app's RTL layout. */}
    {w > 0 && <View style={[StyleSheet.absoluteFill, { direction: 'ltr' }]} pointerEvents="none">
      <Svg style={art} viewBox={`0 0 ${ART_W} ${ART_H}`}>
        <Rect width={ART_W} height={ART_H} fill={c.night} />
        <Rect y={120} width={ART_W} height={60} fill={c.deep} />
        <Rect y={180} width={ART_W} height={46} fill={c.pink} />
        <Rect y={226} width={ART_W} height={40} fill={c.gold} />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: sunX - rayR, top: sunY - rayR, width: rayR * 2, height: rayR * 2, opacity: 0.2 }, raysStyle]}>
        <Svg width={rayR * 2} height={rayR * 2} viewBox="-100 -100 200 200">
          {Array.from({ length: 12 }, (_, i) => <Path key={i} d="M0 0-3-100h6Z" fill={c.cream} transform={`rotate(${i * 30})`} />)}
        </Svg>
      </Animated.View>
      <Animated.View style={[art, sunStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${ART_W} ${ART_H}`}>
          <Defs><ClipPath id="sun"><Circle cx={SUN_X} cy={SUN_Y} r={78} /></ClipPath></Defs>
          <Circle cx={SUN_X} cy={SUN_Y} r={78} fill={c.sunset} />
          <G clipPath="url(#sun)" fill={c.pink}>
            <Rect x={90} y={226} width={170} height={6} /><Rect x={90} y={242} width={170} height={8} /><Rect x={90} y={260} width={170} height={11} />
          </G>
        </Svg>
      </Animated.View>
      <Svg style={art} viewBox={`0 0 ${ART_W} ${ART_H}`}>
        <Path d="M0 270 46 222l22 24 40-62 44 58 30-32 52 62 34-28 82 58V312H0Z" fill={c.plum} />
        <Path d="M108 184l-10 17 10-3 8 5Z" fill={c.cream} />
        <Path d="M0 282c50-14 100 6 160-4s120-12 190 2V312H0Z" fill={c.sea} />
      </Svg>
      <Animated.View style={[art, { width: ART_W * s + 48 * s }, wavesStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${ART_W + 48} ${ART_H}`}>
          <Path d={'M0 296' + 'q12-5 24 0t24 0'.repeat(9)} stroke={c.cream} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.7} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.plane, planeStyle]}><Plane size={22} color={c.cream} /></Animated.View>
      <Grain opacity={0.14} />
    </View>}
    <View style={styles.posterTop}>
      <D1Mark size={34} tile={c.cream} ink={c.night} tilde={c.sunset} sun={c.gold} />
      <Text style={styles.flight}>VUELO SBT·001</Text>
    </View>
    <Animated.View style={[styles.titles, titleStyle]}>
      <Text style={styles.titleBig}>ספרדית</Text>
      <Text style={styles.titleSmall}>לטיול הגדול</Text>
    </Animated.View>
  </View></View>;
}

function Perforation() {
  return <View style={styles.perforation}>
    <View style={[styles.notch, { left: -12 }]} />
    <View style={[styles.notch, { right: -12 }]} />
    <Svg height={2} width="100%" style={styles.dash}><Path d="M0 1H1000" stroke={c.night} strokeOpacity={0.25} strokeWidth={2} strokeDasharray="6 5" /></Svg>
  </View>;
}

const FIELDS: [string, string, boolean][] = [['נוסע/ת', 'אתם', false], ['שער', '1A', false], ['מושב', 'חלון', false], ['עלייה', 'עכשיו', true]];
const BARS = [3, 1.5, 4, 1.5, 2.5, 5, 1.5, 3, 1.5, 4, 2, 1.5, 5, 2, 1.5, 3, 4, 1.5, 2.5, 1.5, 5, 2, 3, 1.5, 4, 2, 1.5, 5, 2, 3, 1.5, 4, 2, 3];

// The stub's dashed arc, from the Hebrew side (right) to the Spanish side (left).
const ARC = { x0: 92, y0: 18, x1: 66, y1: 2, x2: 30, y2: 2, x3: 4, y3: 18 };

function Stub() {
  const reduceMotion = useReducedMotion();
  const hop = useSharedValue(0), blink = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    hop.value = withDelay(1200, withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1));
    blink.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduceMotion, hop, blink]);
  const arcPlaneStyle = useAnimatedStyle(() => {
    const t = reduceMotion ? 0.5 : hop.value, u = 1 - t, a = ARC;
    const x = u * u * u * a.x0 + 3 * u * u * t * a.x1 + 3 * u * t * t * a.x2 + t * t * t * a.x3;
    const y = u * u * u * a.y0 + 3 * u * u * t * a.y1 + 3 * u * t * t * a.y2 + t * t * t * a.y3;
    const dx = 3 * u * u * (a.x1 - a.x0) + 6 * u * t * (a.x2 - a.x1) + 3 * t * t * (a.x3 - a.x2);
    const dy = 3 * u * u * (a.y1 - a.y0) + 6 * u * t * (a.y2 - a.y1) + 3 * t * t * (a.y3 - a.y2);
    const fade = reduceMotion ? 1 : t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1;
    // The plane icon points left, so subtract half a turn from the direction of travel.
    return { opacity: fade, transform: [{ translateX: x - 10 }, { translateY: y - 10 }, { rotate: `${Math.atan2(dy, dx) - Math.PI}rad` }] };
  });
  const blinkStyle = useAnimatedStyle(() => ({ opacity: 1 - blink.value * 0.55 }));
  let x = 0;
  const bars = BARS.map((width, i) => { const bar = <Rect key={i} x={x} width={width} height={34} fill={c.night} />; x += width + 2.5; return bar; });
  return <View style={styles.stub}>
    <View style={styles.route}>
      <View><Text style={styles.label}>מ־</Text><Text style={styles.city}>עברית</Text></View>
      <View style={styles.arc}>
        <Svg width={96} height={24} viewBox="0 0 96 24"><Path d="M4 18C30 2 66 2 92 18" stroke={c.night} strokeOpacity={0.35} strokeWidth={1.6} strokeDasharray="3 4" fill="none" /></Svg>
        <Animated.View style={[styles.arcPlane, arcPlaneStyle]}><Plane size={20} color={c.sunset} /></Animated.View>
      </View>
      <View style={styles.ltr}><Text style={[styles.label, styles.ltrText]}>a</Text><Text style={[styles.city, styles.ltrText]}>Español</Text></View>
    </View>
    <View style={styles.fields}>
      {FIELDS.map(([label, value, accent]) => <View key={label} style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {accent ? <Animated.Text style={[styles.fieldValue, { color: c.stamp }, blinkStyle]}>{value}</Animated.Text>
          : <Text style={styles.fieldValue}>{value}</Text>}
      </View>)}
    </View>
    <View style={styles.barcodeRow}>
      <Svg width={x} height={34}>{bars}</Svg>
      <Text style={styles.buenViaje}>{'BUEN\nVIAJE'}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  ticket: { flex: 1, marginHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 24 } },
  dimmed: { opacity: 0.6 },
  posterFrame: { flex: 1, minHeight: 220, backgroundColor: c.cream, paddingTop: 6, paddingHorizontal: 6, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  poster: { flex: 1, backgroundColor: c.night, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  plane: { position: 'absolute', left: 0, top: 0, width: 22, height: 22 },
  posterTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 },
  flight: { fontFamily: f.mono, fontSize: 11, letterSpacing: 2, color: c.gold },
  titles: { alignItems: 'center', marginTop: 6 },
  titleBig: { fontFamily: f.poster, fontSize: 104, lineHeight: 92, color: c.cream },
  titleSmall: { fontFamily: f.poster, fontSize: 52, lineHeight: 52, color: c.gold },
  perforation: { height: 24, backgroundColor: c.cream, justifyContent: 'center' },
  notch: { position: 'absolute', top: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: c.night },
  dash: { position: 'absolute', left: 20, right: 20, top: 11 },
  stub: { backgroundColor: c.cream, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 12 },
  route: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  label: { fontFamily: f.body, fontSize: 11, color: c.inkMuted, writingDirection: 'rtl' },
  city: { fontFamily: f.poster, fontSize: 40, lineHeight: 40, color: c.night, writingDirection: 'rtl' },
  arc: { width: 96, height: 24, marginBottom: 10, direction: 'ltr' },
  arcPlane: { position: 'absolute', top: 0, left: 0, width: 20, height: 20 },
  ltr: { direction: 'ltr' },
  ltrText: { writingDirection: 'ltr' },
  fields: { flexDirection: 'row', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#0D3B401F' },
  field: { flex: 1, gap: 2 },
  fieldLabel: { fontFamily: f.body, fontSize: 10, color: c.inkMuted, writingDirection: 'rtl' },
  fieldValue: { fontFamily: f.heavy, fontSize: 15, color: c.night, writingDirection: 'rtl' },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buenViaje: { fontFamily: f.mono, fontSize: 12, lineHeight: 16, color: c.inkMuted, writingDirection: 'ltr' },
});

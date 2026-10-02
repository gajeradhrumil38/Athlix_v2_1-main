/* @ds-bundle: {"format":3,"namespace":"AthlixDesignSystem_093a3a","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"SegmentControl","sourcePath":"components/core/SegmentControl.jsx"},{"name":"Toggle","sourcePath":"components/core/Toggle.jsx"},{"name":"ProgressBar","sourcePath":"components/fitness/ProgressBar.jsx"},{"name":"StatRing","sourcePath":"components/fitness/StatRing.jsx"},{"name":"StatTile","sourcePath":"components/fitness/StatTile.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"ca6a5982cad9","components/core/Button.jsx":"984a4e084099","components/core/Card.jsx":"2f451add722f","components/core/Input.jsx":"d29f7379b669","components/core/SegmentControl.jsx":"3030a4dc0193","components/core/Toggle.jsx":"ba02727073fd","components/fitness/ProgressBar.jsx":"ebe8b9adaca4","components/fitness/StatRing.jsx":"74d5afefbd9a","components/fitness/StatTile.jsx":"c06c8748c842","ui_kits/app/screens.jsx":"396f4f7d75a0"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AthlixDesignSystem_093a3a = window.AthlixDesignSystem_093a3a || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  accent: {
    c: 'var(--accent)'
  },
  chest: {
    c: 'var(--chest)'
  },
  back: {
    c: 'var(--back)'
  },
  legs: {
    c: 'var(--legs)'
  },
  shoulders: {
    c: 'var(--shoulders)'
  },
  core: {
    c: 'var(--core)'
  },
  biceps: {
    c: 'var(--biceps)'
  },
  gold: {
    c: 'var(--pr-gold)'
  },
  green: {
    c: 'var(--green)'
  },
  red: {
    c: 'var(--red)'
  },
  purple: {
    c: 'var(--purple)'
  },
  neutral: {
    c: 'var(--text-secondary)'
  }
};

/**
 * Tiny pill for muscle groups, priorities, statuses and PR flags.
 * Tinted-fill style (colour at 14% bg / 33% border) is the app default.
 */
function Badge({
  children,
  tone = 'neutral',
  solid = false,
  uppercase = true,
  style = {},
  ...rest
}) {
  const c = (TONES[tone] || TONES.neutral).c;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'var(--font-sans)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: uppercase ? 'uppercase' : 'none',
    padding: '2px 7px',
    borderRadius: 'var(--radius-xs)',
    lineHeight: 1.4,
    whiteSpace: 'nowrap'
  };
  const skin = solid ? {
    background: c,
    color: 'var(--on-accent)',
    border: '1px solid transparent'
  } : {
    background: `color-mix(in srgb, ${c} 14%, transparent)`,
    color: c,
    border: `1px solid color-mix(in srgb, ${c} 33%, transparent)`
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...base,
      ...skin,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Athlix primary control. Lime fill for the main action; glow-on-hover
 * secondary for everything else; ghost for tertiary. iOS press-shrink built in.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  icon = null,
  iconRight = null,
  glowColor = 'blue',
  style = {},
  ...rest
}) {
  const heights = {
    sm: 36,
    md: 48,
    lg: 54
  };
  const fonts = {
    sm: 13,
    md: 15,
    lg: 15
  };
  const pads = {
    sm: '0 14px',
    md: '0 20px',
    lg: '0 24px'
  };
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: heights[size],
    minHeight: heights[size],
    padding: pads[size],
    width: fullWidth ? '100%' : undefined,
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-sans)',
    fontSize: fonts[size],
    fontWeight: 600,
    lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid transparent',
    opacity: disabled ? 0.45 : 1,
    transition: 'background .15s, opacity .15s, box-shadow .2s, transform .12s, border-color .25s',
    WebkitTapHighlightColor: 'transparent'
  };
  const glowRGB = glowColor === 'accent' ? '200, 255, 0' : glowColor === 'subtle' ? '130, 146, 164' : '37, 99, 235';
  const variants = {
    primary: {
      background: 'var(--accent)',
      color: 'var(--on-accent)',
      borderColor: 'color-mix(in srgb, var(--accent) 70%, #fff 30%)',
      boxShadow: 'var(--shadow-surface)'
    },
    secondary: {
      background: 'var(--bg-elevated)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      borderColor: 'transparent'
    },
    outline: {
      background: 'var(--accent-dim)',
      color: 'var(--accent)',
      borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)'
    },
    danger: {
      background: 'color-mix(in srgb, var(--red) 12%, transparent)',
      color: 'var(--red)',
      borderColor: 'color-mix(in srgb, var(--red) 30%, transparent)'
    }
  };
  const [hover, setHover] = React.useState(false);
  const hoverStyle = !disabled && hover ? variant === 'primary' ? {
    background: 'var(--accent-hover)'
  } : variant === 'secondary' ? {
    background: 'var(--bg-hover)',
    boxShadow: `0 4px 20px rgba(${glowRGB}, 0.18)`,
    borderColor: `rgba(${glowRGB}, 0.35)`,
    transform: 'translateY(-1px)'
  } : variant === 'ghost' ? {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)'
  } : variant === 'outline' ? {
    background: 'color-mix(in srgb, var(--accent) 22%, transparent)'
  } : {
    background: 'color-mix(in srgb, var(--red) 20%, transparent)'
  } : {};
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...base,
      ...variants[variant],
      ...hoverStyle,
      ...style
    }
  }, rest), icon, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Surface card — the workspace primitive. Optional uppercase eyebrow header
 * with a trailing action. `glass` adds the soft elevation shadow.
 */
function Card({
  children,
  title,
  action,
  glass = false,
  padding = 14,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)',
      padding,
      boxShadow: glass ? 'var(--shadow-surface)' : 'none',
      ...style
    }
  }, rest), (title || action) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)'
    }
  }, title), action && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--accent)',
      cursor: 'pointer'
    }
  }, action)), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Dark form field with a label and lime focus ring. */
function Input({
  label,
  hint,
  error,
  icon = null,
  style = {},
  id,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const fieldId = id || React.useId();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      display: 'block',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--text-secondary)',
      marginBottom: 6
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 14,
      display: 'flex',
      color: 'var(--text-muted)'
    }
  }, icon), /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    onFocus: e => {
      setFocus(true);
      rest.onFocus?.(e);
    },
    onBlur: e => {
      setFocus(false);
      rest.onBlur?.(e);
    },
    style: {
      width: '100%',
      height: 'var(--control-height)',
      padding: icon ? '0 16px 0 40px' : '0 16px',
      background: 'color-mix(in srgb, var(--bg-elevated) 90%, #fff 4%)',
      border: `1px solid ${error ? 'var(--red)' : focus ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
      fontSize: 15,
      outline: 'none',
      boxShadow: focus ? '0 0 0 3px rgba(200,255,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      transition: 'border-color .15s, box-shadow .2s, background .2s',
      ...style
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      color: error ? 'var(--red)' : 'var(--text-muted)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/SegmentControl.jsx
try { (() => {
/**
 * iOS-style segmented control. Active segment gets the lime fill + glow.
 * Use for short, mutually-exclusive choices (Day/Week/Month, kg/lbs).
 */
function SegmentControl({
  options = [],
  value,
  onChange = () => {},
  style = {}
}) {
  const opts = options.map(o => typeof o === 'string' ? {
    label: o,
    value: o
  } : o);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: 4,
      gap: 4,
      ...style
    }
  }, opts.map(o => {
    const active = o.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      type: "button",
      onClick: () => onChange(o.value),
      style: {
        padding: '6px 14px',
        borderRadius: 12,
        border: 'none',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
        background: active ? 'var(--accent)' : 'transparent',
        boxShadow: active ? 'var(--glow-segment)' : 'none',
        transition: 'background .15s, color .15s, box-shadow .2s'
      }
    }, o.label);
  }));
}
Object.assign(__ds_scope, { SegmentControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SegmentControl.jsx", error: String((e && e.message) || e) }); }

// components/core/Toggle.jsx
try { (() => {
/** iOS toggle switch. Lime thumb + tinted track when on. */
function Toggle({
  checked = false,
  onChange = () => {},
  disabled = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    onClick: () => !disabled && onChange(!checked),
    style: {
      position: 'relative',
      width: 52,
      height: 31,
      flexShrink: 0,
      border: `1px solid ${checked ? 'rgba(200,255,0,0.40)' : 'var(--border)'}`,
      borderRadius: 999,
      background: checked ? 'rgba(200,255,0,0.18)' : 'var(--bg-elevated)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      padding: 0,
      transition: 'background .2s, border-color .2s',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: 21,
      height: 21,
      borderRadius: '50%',
      background: checked ? 'var(--accent)' : '#fff',
      boxShadow: checked ? '0 1px 4px rgba(200,255,0,0.35)' : '0 1px 3px rgba(0,0,0,0.35)',
      transform: checked ? 'translateX(20px)' : 'translateX(0)',
      transition: 'transform .2s, background .2s, box-shadow .2s'
    }
  }));
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/fitness/ProgressBar.jsx
try { (() => {
/** Lime progress bar with optional glow on the fill. Goals, set completion, volume. */
function ProgressBar({
  value = 0,
  max = 100,
  height = 12,
  glow = true,
  color = 'var(--accent)',
  track = 'var(--bg-elevated)',
  style = {}
}) {
  const pct = Math.min(Math.max(value / max, 0), 1) * 100;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height,
      background: track,
      borderRadius: 999,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${pct}%`,
      background: color,
      borderRadius: 999,
      boxShadow: glow ? '0 0 10px var(--accent-glow)' : 'none',
      transition: 'width 1s cubic-bezier(0.4,0,0.2,1)'
    }
  }));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fitness/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/fitness/StatRing.jsx
try { (() => {
/**
 * Animated progress ring with a VictoryStriker numeral at its centre.
 * The Home/Progress hero metric. Stroke colour drives the meaning
 * (volume blue, recovery yellow, strain lime).
 */
function StatRing({
  value = 0,
  max = 100,
  size = 88,
  stroke = 8,
  color = 'var(--ring-strain)',
  label,
  subLabel,
  display
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / max, 0), 1);
  const offset = circ - pct * circ;
  const center = size / 2;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: 'rotate(-90deg)'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: center,
    cy: center,
    r: r,
    fill: "none",
    stroke: "var(--bg-elevated)",
    strokeWidth: stroke
  }), /*#__PURE__*/React.createElement("circle", {
    cx: center,
    cy: center,
    r: r,
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeDasharray: circ,
    strokeDashoffset: offset,
    style: {
      transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-victory)',
      fontSize: size * 0.25,
      color: '#fff',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums'
    }
  }, display != null ? display : Math.round(value))), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.06em',
      color: '#fff'
    }
  }, label), subLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 9,
      fontWeight: 500,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)',
      marginTop: -4
    }
  }, subLabel));
}
Object.assign(__ds_scope, { StatRing });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fitness/StatRing.jsx", error: String((e && e.message) || e) }); }

// components/fitness/StatTile.jsx
try { (() => {
/**
 * Compact stat tile — big VictoryStriker value over an uppercase label,
 * with an optional Lucide icon and lime delta. The quick-stats grid unit.
 */
function StatTile({
  value,
  label,
  unit,
  icon = null,
  delta,
  accent = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: accent ? 'var(--accent-dim)' : 'var(--bg-surface)',
      border: `1px solid ${accent ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '12px 12px 11px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)'
    }
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: accent ? 'var(--accent)' : 'var(--text-muted)'
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-victory)',
      fontSize: 30,
      lineHeight: 0.9,
      color: accent ? 'var(--accent)' : 'var(--text-primary)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-muted)'
    }
  }, unit)), delta != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 10,
      fontWeight: 600,
      color: String(delta).trim().startsWith('-') ? 'var(--red)' : 'var(--green)'
    }
  }, delta));
}
Object.assign(__ds_scope, { StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/fitness/StatTile.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/screens.jsx
try { (() => {
/* ════════════════════════════════════════════════════════════════════
   ATHLIX UI KIT — screen recreations
   Faithful, mostly-cosmetic rebuilds of the real app surfaces, composing
   the design-system primitives from window.AthlixDesignSystem_093a3a.
   Exports every screen + helper to window for the index.html shell.
   ════════════════════════════════════════════════════════════════════ */
const DS = window.AthlixDesignSystem_093a3a;
const {
  Button,
  Badge,
  SegmentControl,
  Toggle,
  Input,
  Card,
  StatRing,
  ProgressBar,
  StatTile
} = DS;
const _pascal = n => n.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
const Icon = ({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  style
}) => {
  const node = window.lucide && window.lucide.icons && window.lucide.icons[_pascal(name)] || [];
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: {
      display: 'inline-flex',
      flexShrink: 0,
      ...style
    }
  }, node.map((child, i) => React.createElement(child[0], {
    key: i,
    ...child[1]
  })));
};

/* ─── Shared chrome ─────────────────────────────────────────────────── */

function MobileHeader({
  title,
  onBack,
  right
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 54,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      borderBottom: '1px solid var(--border)',
      background: 'color-mix(in srgb, var(--bg-base) 82%, transparent)',
      backdropFilter: 'blur(20px)',
      position: 'sticky',
      top: 0,
      zIndex: 90
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      width: 36,
      height: 36,
      borderRadius: 999,
      border: 'none',
      background: 'var(--bg-elevated)',
      color: 'var(--text-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--text-primary)',
      letterSpacing: '0.02em'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 999,
      background: 'var(--accent-dim)',
      color: 'var(--accent)',
      border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, right || /*#__PURE__*/React.createElement(Icon, {
    name: "home",
    size: 16
  })));
}
const NAV = [{
  id: 'home',
  icon: 'home',
  label: 'Home'
}, {
  id: 'progress',
  icon: 'activity',
  label: 'Progress'
}, {
  id: 'calendar',
  icon: 'calendar',
  label: 'Calendar'
}, {
  id: 'run',
  icon: 'footprints',
  label: 'Run'
}, {
  id: 'settings',
  icon: 'settings',
  label: 'Settings'
}];
function BottomNav({
  active,
  onNav
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 'var(--tabbar-height)',
      background: 'color-mix(in srgb, var(--bg-base) 92%, transparent)',
      backdropFilter: 'blur(24px)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '0 8px',
      zIndex: 98
    }
  }, NAV.map(n => {
    const on = active === n.id;
    return /*#__PURE__*/React.createElement("button", {
      key: n.id,
      onClick: () => onNav(n.id),
      style: {
        position: 'relative',
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: on ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'color .15s'
      }
    }, on && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        bottom: 8,
        width: 44,
        height: 10,
        borderRadius: 999,
        background: 'rgba(200,255,0,0.28)',
        filter: 'blur(10px)'
      }
    }), /*#__PURE__*/React.createElement(Icon, {
      name: n.icon,
      size: 20,
      style: {
        position: 'relative',
        zIndex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 500,
        position: 'relative',
        zIndex: 1
      }
    }, n.label));
  }));
}
function Fab({
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      position: 'absolute',
      right: 16,
      bottom: 'calc(var(--tabbar-height) + 16px)',
      width: 56,
      height: 56,
      borderRadius: 999,
      border: 'none',
      background: 'var(--accent)',
      color: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 20px var(--accent-glow)',
      cursor: 'pointer',
      zIndex: 95
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 24
  }));
}

/* ─── AUTH ──────────────────────────────────────────────────────────── */

function AuthScreen({
  onSignIn
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -120,
      left: -80,
      width: 280,
      height: 280,
      borderRadius: '50%',
      background: 'var(--accent)',
      opacity: 0.06,
      filter: 'blur(80px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginBottom: 32,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 56,
      lineHeight: 0.8,
      letterSpacing: '0.06em',
      color: 'var(--accent)'
    }
  }, "ATHLIX"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 14,
      color: 'var(--text-secondary)'
    }
  }, "Track. Recover. Perform.")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 360,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 18px',
      fontSize: 22,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Sign in"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Email",
    defaultValue: "alex@athlix.app"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Password",
    type: "password",
    defaultValue: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: 'var(--text-secondary)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    defaultChecked: true,
    style: {
      width: 16,
      height: 16
    }
  }), " Remember me for 30 days"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    onClick: onSignIn
  }, "Sign In")), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      marginTop: 18,
      fontSize: 13,
      color: 'var(--text-secondary)'
    }
  }, "Don't have an account? ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)',
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Sign up free"))));
}

/* ─── HOME ──────────────────────────────────────────────────────────── */

const WEEK = [{
  l: 'M',
  d: '12',
  status: 'trained'
}, {
  l: 'T',
  d: '13',
  status: 'rest'
}, {
  l: 'W',
  d: '14',
  status: 'trained'
}, {
  l: 'T',
  d: '15',
  status: 'trained'
}, {
  l: 'F',
  d: '16',
  status: 'today-rest'
}, {
  l: 'S',
  d: '17',
  status: 'future'
}, {
  l: 'S',
  d: '18',
  status: 'future'
}];
function WeeklyGoalCard() {
  const heights = {
    trained: '100%',
    rest: '30%',
    'today-rest': '30%',
    future: '20%'
  };
  return /*#__PURE__*/React.createElement(Card, {
    title: "Weekly Goal",
    action: "Edit",
    style: {
      padding: '12px 10px',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--text-primary)',
      lineHeight: 1
    }
  }, "3"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-secondary)'
    }
  }, "/ 4 days")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--accent)'
    }
  }, "75%")), /*#__PURE__*/React.createElement(ProgressBar, {
    value: 3,
    max: 4,
    height: 10,
    style: {
      marginBottom: 12
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 6,
      height: 70
    }
  }, WEEK.map((d, i) => {
    const trained = d.status === 'trained';
    const todayRest = d.status === 'today-rest';
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        height: '100%'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        width: '100%',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100%',
        height: heights[d.status],
        borderRadius: '6px 6px 0 0',
        background: trained ? 'var(--accent)' : todayRest ? 'transparent' : 'var(--bg-elevated)',
        border: todayRest ? '1px dashed rgba(200,255,0,0.5)' : trained ? 'none' : '1px solid var(--border)',
        boxShadow: trained ? '0 0 10px var(--accent-glow)' : 'none'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: 'var(--text-secondary)',
        fontWeight: 500
      }
    }, d.l));
  })));
}
const SUGGESTIONS = [{
  title: 'Pull Day',
  muscles: ['Back', 'Biceps'],
  reason: 'Push-heavy week — 18 chest sets vs 6 back sets',
  priority: 'PRIORITY',
  color: '#EF9F27'
}, {
  title: 'Leg Day',
  muscles: ['Legs', 'Glutes'],
  reason: 'Last leg session 4 days ago',
  priority: 'RECOMMENDED',
  color: 'var(--accent)'
}];
const MCLR = {
  Back: '#1A9A80',
  Biceps: '#5A9E3A',
  Legs: '#2A6090',
  Glutes: '#8A3A10',
  Chest: '#C45A7A'
};
function TrainNextCard() {
  return /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: 10,
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      letterSpacing: '1.5px',
      color: 'var(--text-muted)',
      fontWeight: 700
    }
  }, "TRAIN NEXT"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: 'var(--accent)'
    }
  }, "AI-suggested")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, SUGGESTIONS.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: 'var(--bg-elevated)',
      border: '0.5px solid var(--border)',
      borderLeft: `2.5px solid ${s.color}`,
      borderRadius: 8,
      padding: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, s.muscles.map(m => /*#__PURE__*/React.createElement("div", {
    key: m,
    style: {
      width: 5,
      height: 5,
      borderRadius: '50%',
      background: MCLR[m]
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, s.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 8,
      color: 'var(--text-muted)',
      lineHeight: 1.3,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, s.reason), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 3,
      marginTop: 3
    }
  }, s.muscles.map(m => /*#__PURE__*/React.createElement("span", {
    key: m,
    style: {
      fontSize: 7,
      padding: '1px 4px',
      borderRadius: 4,
      fontWeight: 700,
      background: `${MCLR[m]}18`,
      color: MCLR[m],
      border: `0.5px solid ${MCLR[m]}33`
    }
  }, m)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 7,
      padding: '1px 4px',
      borderRadius: 4,
      fontWeight: 700,
      letterSpacing: '0.5px',
      background: `${s.color}18`,
      color: s.color,
      border: `0.5px solid ${s.color}33`
    }
  }, s.priority), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: s.color,
      lineHeight: 1
    }
  }, "\u203A"))))));
}
function HomeScreen({
  onNav,
  onStart
}) {
  const [view, setView] = React.useState('Week');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      paddingBottom: 90
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      background: 'rgba(10,12,16,0.95)',
      backdropFilter: 'blur(12px)',
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      padding: '12px 8px 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      justifySelf: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'var(--bg-elevated)',
      padding: '4px 10px',
      borderRadius: 999,
      border: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "zap",
    size: 12,
    color: "var(--accent)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, "12"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      justifySelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 16,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-primary)',
      minWidth: 64,
      textAlign: 'center'
    }
  }, "Week 24"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNav('settings'),
    style: {
      justifySelf: 'end',
      width: 32,
      height: 32,
      borderRadius: 999,
      background: 'var(--accent-dim)',
      color: 'var(--accent)',
      border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer'
    }
  }, "A")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      padding: '4px 8px 0'
    }
  }, ['Day', 'Week', 'Month'].map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    onClick: () => setView(m),
    style: {
      flex: 1,
      padding: '6px 0',
      fontSize: 12,
      fontWeight: 500,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      borderBottom: `2px solid ${view === m ? 'var(--accent)' : 'transparent'}`,
      color: view === m ? 'var(--accent)' : 'var(--text-muted)'
    }
  }, m))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 12px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Card, {
    glass: true,
    style: {
      padding: '18px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement(StatRing, {
    value: 75,
    color: "var(--ring-volume)",
    label: "VOLUME",
    subLabel: "Optimal"
  }), /*#__PURE__*/React.createElement(StatRing, {
    value: 54,
    color: "var(--ring-recovery)",
    label: "RECOVERY",
    subLabel: "Adequate"
  }), /*#__PURE__*/React.createElement(StatRing, {
    value: 62,
    color: "var(--ring-strain)",
    label: "STRAIN",
    subLabel: "Building"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    label: "Streak",
    value: "12",
    unit: "d",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "flame",
      size: 13
    }),
    accent: true
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Volume",
    value: "8.4k",
    unit: "lbs",
    delta: "+12%"
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "Sets",
    value: "24"
  }), /*#__PURE__*/React.createElement(StatTile, {
    label: "PRs",
    value: "3",
    delta: "+1"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid color-mix(in srgb, var(--pr-gold) 30%, transparent)',
      background: 'color-mix(in srgb, var(--pr-gold) 10%, var(--bg-surface))',
      borderRadius: 'var(--radius-lg)',
      padding: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'color-mix(in srgb, var(--pr-gold) 14%, transparent)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trophy",
    size: 14,
    color: "var(--pr-gold)"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--pr-gold)'
    }
  }, "New PR: Bench Press 185 lbs")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(WeeklyGoalCard, null), /*#__PURE__*/React.createElement(TrainNextCard, null)), /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)',
      fontWeight: 600
    }
  }, "Today's Activities"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-secondary)'
    }
  }, "Jun 16")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 10,
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)',
      border: '1px dashed var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: 'var(--text-muted)'
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--text-primary)'
    }
  }, "Rest Day"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-secondary)'
    }
  }, "No activity logged"))), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "sm",
    onClick: onStart
  }, "Log"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid color-mix(in srgb, var(--purple) 25%, transparent)',
      borderRadius: 'var(--radius-lg)',
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 14,
    color: "var(--purple)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: 'var(--purple)'
    }
  }, "Weekly AI Summary")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 11,
      lineHeight: 1.6,
      color: 'var(--text-secondary)'
    }
  }, "You hit Chest, Shoulders and Triceps this week. Consistency is strong \u2014 add a pull session to balance your push volume and keep recovery on track."))));
}

/* ─── ACTIVE WORKOUT ────────────────────────────────────────────────── */

function SetRow({
  index,
  weight,
  reps,
  done,
  onToggle
}) {
  const Box = ({
    value,
    label,
    accent
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      height: 78,
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${done ? 'rgba(200,255,0,0.12)' : 'var(--border)'}`,
      background: 'var(--bg-base)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      width: 44,
      border: 'none',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      background: 'transparent',
      color: 'var(--text-muted)',
      fontSize: 22,
      fontWeight: 300,
      cursor: 'pointer'
    }
  }, "\u2212"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-victory)',
      fontSize: 32,
      lineHeight: 1,
      color: 'var(--text-primary)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)'
    }
  }, label)), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 44,
      border: 'none',
      borderLeft: '1px solid rgba(255,255,255,0.05)',
      background: 'transparent',
      color: 'var(--accent)',
      fontSize: 22,
      fontWeight: 300,
      cursor: 'pointer'
    }
  }, "+"));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 'var(--radius-lg)',
      border: `1px solid ${done ? 'rgba(200,255,0,0.12)' : 'var(--border)'}`,
      background: 'var(--bg-base)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      background: done ? 'var(--accent)' : 'var(--border)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 14px 8px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: done ? 'accent' : 'neutral',
    solid: false,
    style: done ? {} : {
      background: 'var(--bg-elevated)',
      color: 'var(--text-secondary)',
      border: 'none'
    }
  }, "Set ", index), done && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'rgba(200,255,0,0.7)'
    }
  }, "Done")), /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      background: done ? 'rgba(200,255,0,0.10)' : 'var(--bg-elevated)',
      border: `1px solid ${done ? 'rgba(200,255,0,0.5)' : 'var(--border)'}`,
      color: done ? 'var(--accent)' : 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      padding: '0 12px 12px 16px'
    }
  }, /*#__PURE__*/React.createElement(Box, {
    value: weight,
    label: "lbs"
  }), /*#__PURE__*/React.createElement(Box, {
    value: reps,
    label: "reps"
  })));
}
function WorkoutScreen({
  onBack
}) {
  const [sets, setSets] = React.useState([{
    w: 135,
    r: 12,
    done: true
  }, {
    w: 155,
    r: 10,
    done: true
  }, {
    w: 175,
    r: 8,
    done: false
  }, {
    w: 175,
    r: 8,
    done: false
  }]);
  const toggle = i => setSets(s => s.map((x, j) => j === i ? {
    ...x,
    done: !x.done
  } : x));
  const doneCount = sets.filter(s => s.done).length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      width: 36,
      height: 36,
      borderRadius: 999,
      border: 'none',
      background: 'var(--bg-elevated)',
      color: 'var(--text-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, "Push Day"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--text-secondary)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 11
  }), " 24:18")), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 36,
      padding: '0 14px',
      borderRadius: 'var(--radius-md)',
      border: 'none',
      background: 'var(--accent)',
      color: '#000',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer'
    }
  }, "Finish")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '12px 16px',
      overflowX: 'auto'
    },
    className: "no-scrollbar"
  }, ['Bench Press', 'Incline DB', 'Lateral Raise', 'Triceps'].map((e, i) => /*#__PURE__*/React.createElement("span", {
    key: e,
    style: {
      flexShrink: 0,
      padding: '7px 12px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      background: i === 0 ? 'var(--accent-dim)' : 'var(--bg-elevated)',
      color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)',
      border: `1px solid ${i === 0 ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'var(--border)'}`
    }
  }, e))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 16px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 'var(--radius-md)',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/exercises/bench-press-1.png",
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, "Bench Press"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 5
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "chest"
  }, "Chest"), /*#__PURE__*/React.createElement(Badge, {
    tone: "shoulders"
  }, "Shoulders"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--text-muted)',
      alignSelf: 'center'
    }
  }, doneCount, "/", sets.length, " sets")))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, sets.map((s, i) => /*#__PURE__*/React.createElement(SetRow, {
    key: i,
    index: i + 1,
    weight: s.w,
    reps: s.r,
    done: s.done,
    onToggle: () => toggle(i)
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 46,
      borderRadius: 'var(--radius-md)',
      border: '1px dashed var(--border)',
      background: 'transparent',
      color: 'var(--text-secondary)',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  }), " Add Set")));
}

/* ─── PROGRESS ──────────────────────────────────────────────────────── */

const BARS = [{
  d: 'Mon',
  v: 64
}, {
  d: 'Tue',
  v: 0
}, {
  d: 'Wed',
  v: 88
}, {
  d: 'Thu',
  v: 72
}, {
  d: 'Fri',
  v: 40
}, {
  d: 'Sat',
  v: 0
}, {
  d: 'Sun',
  v: 0
}];
const MUSCLE_LOAD = [{
  n: 'Chest',
  v: 92,
  c: 'var(--chest)'
}, {
  n: 'Shoulders',
  v: 74,
  c: 'var(--shoulders)'
}, {
  n: 'Back',
  v: 58,
  c: 'var(--back)'
}, {
  n: 'Legs',
  v: 44,
  c: 'var(--legs)'
}, {
  n: 'Core',
  v: 30,
  c: 'var(--core)'
}];
function ProgressScreen() {
  const [tab, setTab] = React.useState('Volume');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      paddingBottom: 90
    }
  }, /*#__PURE__*/React.createElement(MobileHeader, {
    title: "Progress"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 12px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(SegmentControl, {
    options: ['Volume', 'Strength', 'Muscles'],
    value: tab,
    onChange: setTab
  })), /*#__PURE__*/React.createElement(Card, {
    glass: true,
    style: {
      padding: 18,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: 'var(--text-secondary)'
    }
  }, "Total Volume \xB7 This Week"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-victory)',
      fontSize: 64,
      lineHeight: 1,
      color: 'var(--text-primary)',
      margin: '6px 0',
      fontVariantNumeric: 'tabular-nums'
    }
  }, "48.2", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 28,
      color: 'var(--text-muted)'
    }
  }, "k")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--green)'
    }
  }, "\u25B2 12% vs last week")), /*#__PURE__*/React.createElement(Card, {
    title: "Daily Volume",
    style: {
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
      height: 110,
      marginTop: 4
    }
  }, BARS.map(b => /*#__PURE__*/React.createElement("div", {
    key: b.d,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      width: '100%',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '70%',
      height: `${Math.max(b.v, 4)}%`,
      borderRadius: '5px 5px 0 0',
      background: b.v ? 'var(--accent)' : 'var(--bg-elevated)',
      boxShadow: b.v ? '0 0 10px var(--accent-glow)' : 'none',
      border: b.v ? 'none' : '1px solid var(--border)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-secondary)'
    }
  }, b.d))))), /*#__PURE__*/React.createElement(Card, {
    title: "Muscle Load",
    style: {
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      marginTop: 4
    }
  }, MUSCLE_LOAD.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.n,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-secondary)'
    }
  }, m.n), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, m.v, "%")), /*#__PURE__*/React.createElement(ProgressBar, {
    value: m.v,
    max: 100,
    color: m.c,
    glow: false,
    height: 7
  }))))), /*#__PURE__*/React.createElement(Card, {
    title: "Recent PRs",
    action: "See all",
    style: {
      padding: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginTop: 4
    }
  }, [['Bench Press', '185 lbs'], ['Squat', '275 lbs'], ['Deadlift', '315 lbs']].map(([n, v]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '9px 12px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trophy",
    size: 15,
    color: "var(--pr-gold)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--text-primary)'
    }
  }, n)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-victory)',
      fontSize: 18,
      color: 'var(--pr-gold)'
    }
  }, v)))))));
}

/* ─── SETTINGS ──────────────────────────────────────────────────────── */

function SettingsScreen() {
  const [vals, setVals] = React.useState({
    haptics: true,
    notif: true,
    units: false
  });
  const Row = ({
    icon,
    label,
    children
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '13px 14px',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 8,
      background: 'var(--bg-elevated)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--text-primary)'
    }
  }, label)), children);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      paddingBottom: 90
    }
  }, /*#__PURE__*/React.createElement(MobileHeader, {
    title: "Settings"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 12px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    glass: true,
    style: {
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 999,
      background: 'var(--accent-dim)',
      color: 'var(--accent)',
      border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 22,
      fontWeight: 700
    }
  }, "A"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, "Alex Carter"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-secondary)'
    }
  }, "alex@athlix.app \xB7 Strength")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "Edit")), /*#__PURE__*/React.createElement(Card, {
    title: "Preferences",
    padding: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(Row, {
    icon: "vibrate",
    label: "Haptic feedback"
  }, /*#__PURE__*/React.createElement(Toggle, {
    checked: vals.haptics,
    onChange: v => setVals(s => ({
      ...s,
      haptics: v
    }))
  })), /*#__PURE__*/React.createElement(Row, {
    icon: "bell",
    label: "Notifications"
  }, /*#__PURE__*/React.createElement(Toggle, {
    checked: vals.notif,
    onChange: v => setVals(s => ({
      ...s,
      notif: v
    }))
  })), /*#__PURE__*/React.createElement(Row, {
    icon: "scale",
    label: "Weight units"
  }, /*#__PURE__*/React.createElement(SegmentControl, {
    options: ['kg', 'lbs'],
    value: vals.units ? 'kg' : 'lbs',
    onChange: v => setVals(s => ({
      ...s,
      units: v === 'kg'
    }))
  }))), /*#__PURE__*/React.createElement(Card, {
    title: "Account",
    padding: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(Row, {
    icon: "shield",
    label: "Privacy"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement(Row, {
    icon: "heart-pulse",
    label: "Connect WHOOP"
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "green"
  }, "Linked")), /*#__PURE__*/React.createElement(Row, {
    icon: "log-out",
    label: "Sign out"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })))));
}
function PlaceholderScreen({
  title,
  icon
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      paddingBottom: 90
    }
  }, /*#__PURE__*/React.createElement(MobileHeader, {
    title: title
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: '80px 24px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 18,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 28
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      maxWidth: 220
    }
  }, "This surface isn't part of the kit recreation \u2014 explore Home, Progress, Workout & Settings.")));
}
window.AthlixKit = {
  AuthScreen,
  HomeScreen,
  WorkoutScreen,
  ProgressScreen,
  SettingsScreen,
  PlaceholderScreen,
  BottomNav,
  Fab,
  Icon
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/screens.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SegmentControl = __ds_scope.SegmentControl;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.StatRing = __ds_scope.StatRing;

__ds_ns.StatTile = __ds_scope.StatTile;

})();

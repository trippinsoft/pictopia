interface Typography {
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
}

export interface Theme {
  name: string;
  colors: {
    background?: string;
    foreground?: string;
    card?: string;
    cardForeground?: string;
    popover?: string;
    popoverForeground?: string;
    primary?: string;
    primaryForeground?: string;
    secondary?: string;
    secondaryForeground?: string;
    tertiary?: string;
    tertiaryForeground?: string;
    muted?: string;
    mutedForeground?: string;
    accent?: string;
    accentForeground?: string;
    destructive?: string;
    destructiveForeground?: string;
    success?: string;
    successForeground?: string;
    warning?: string;
    warningForeground?: string;
    border?: string;
    input?: string;
    ring?: string;
    overlay?: string;
    notification?: string;
    /** Immersive photo stage behind the vertical feed (dark in both themes). */
    stage?: string;
    stageForeground?: string;
    /** Playful Adventure: soft shadow under stickers and cards, set by the chosen pastel. */
    tint?: string;
    /** Streak flame and progress highlights (fills). */
    sun?: string;
    sunSoft?: string;
    /** The "or" medallion and pending-deletion icon (fills). */
    tomato?: string;
    /** Progress bars and completion ticks (fills). */
    grass?: string;
  };
  typography: {
    h1?: Typography;
    h2?: Typography;
    h3?: Typography;
    h4?: Typography;
    h5?: Typography;
    h6?: Typography;
    body?: Typography;
    caption?: Typography;
    button?: Typography;
    /** Editorial headline (Home invitation). */
    display?: Typography;
    /** The large A / B letters on Adventure choices. */
    mark?: Typography;
    /** Serif titles on cards (Adventure names, games). */
    headline?: Typography;
  };
}

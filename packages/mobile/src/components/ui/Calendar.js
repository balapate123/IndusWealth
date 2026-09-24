import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING, alpha } from '../../constants/tokens';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import Text from './Text';
import {
    WEEKDAY_LABELS,
    isBetween,
    monthGrid,
    monthTitle,
    openingMonth,
    stepMonth,
    toISO,
} from '../../utils/calendar';

/**
 * A month grid, in plain React Native.
 *
 * **Deliberately not `@react-native-community/datetimepicker`.** That is a
 * native module, and adding one means an EAS rebuild before any of this reaches
 * a device — for a feature that is otherwise pure JS and loads straight off
 * Metro. A grid of touchables costs less than the rebuild it avoids, and it
 * looks like the rest of the app rather than like the OS.
 *
 * All the arithmetic lives in `utils/calendar.js` and is tested there. This
 * file decides only what a cell looks like, because the one thing a calendar
 * gets wrong is being off by one, and that is not a rendering question.
 *
 * `start` and `end` are both passed so the days between them can be filled:
 * a range you can see is the difference between picking two dates and picking
 * a period.
 *
 * ## Which month is showing
 *
 * `initialFocus` seeds the visible month **once**, and paging is local state
 * after that. There is deliberately no effect following the selection: the
 * moment you page to April to pick an end date, an effect anchored on the
 * start would drag the grid back to March underneath your finger.
 *
 * When the caller does want the grid moved — the user switched which end they
 * are editing, or tapped a preset — it remounts this component with a new
 * `key`. That is the `FlagEditorSheet` pattern: initialise from props on
 * purpose rather than write state from an effect, which is also what keeps
 * this file free of a dependency-array suppression (and `lint:theme` errors on
 * one, because that config does not load `react-hooks` at all).
 */

const CELL = 40;

const makeStyles = (t) => StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACING.SMALL,
    },
    nav: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.SURFACE_HIGH,
    },
    week: { flexDirection: 'row' },
    weekdays: { marginBottom: 2 },
    // Every cell is the same width whether or not it holds a day, so the
    // columns line up with the weekday headings above them.
    cell: {
        flex: 1,
        height: CELL,
        alignItems: 'center',
        justifyContent: 'center',
    },
    day: {
        width: CELL - 6,
        height: CELL - 6,
        borderRadius: (CELL - 6) / 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    endpoint: { backgroundColor: t.ACCENT },
    // Square rather than round, so a filled run reads as one continuous band
    // instead of a row of separate dots.
    inRange: {
        width: '100%',
        borderRadius: 0,
        backgroundColor: alpha(t.ACCENT, 0.16),
    },
    today: {
        borderWidth: 1,
        borderColor: t.ACCENT_BORDER,
    },
    wrap: {
        paddingVertical: SPACING.SMALL,
        borderRadius: RADIUS.MEDIUM,
    },
});

const Calendar = ({ start, end, initialFocus, onSelect, today = new Date() }) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    // Seeded once. Paging from here is the user's business — see the note above
    // on why no effect drags this back to the selection.
    const [view, setView] = useState(() => openingMonth(initialFocus, today));

    const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());
    const weeks = monthGrid(view.year, view.monthIndex);

    return (
        <View style={styles.wrap}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => setView((v) => stepMonth(v, -1))}
                    style={styles.nav}
                    accessibilityRole="button"
                    accessibilityLabel="Previous month"
                >
                    <Ionicons name="chevron-back" size={18} color={theme.TEXT_SECONDARY} />
                </TouchableOpacity>

                <Text variant="label">{monthTitle(view.year, view.monthIndex)}</Text>

                <TouchableOpacity
                    onPress={() => setView((v) => stepMonth(v, 1))}
                    style={styles.nav}
                    accessibilityRole="button"
                    accessibilityLabel="Next month"
                >
                    <Ionicons name="chevron-forward" size={18} color={theme.TEXT_SECONDARY} />
                </TouchableOpacity>
            </View>

            <View style={[styles.week, styles.weekdays]}>
                {WEEKDAY_LABELS.map((label, index) => (
                    <View key={index} style={styles.cell}>
                        <Text variant="meta" tone="muted">{label}</Text>
                    </View>
                ))}
            </View>

            {weeks.map((week, weekIndex) => (
                <View key={weekIndex} style={styles.week}>
                    {week.map((day, dayIndex) => {
                        if (day === null) return <View key={dayIndex} style={styles.cell} />;

                        const iso = toISO(view.year, view.monthIndex, day);
                        const isEndpoint = iso === start || iso === end;
                        const isFill = isBetween(iso, start, end);
                        const isToday = iso === todayISO;

                        return (
                            <View key={dayIndex} style={styles.cell}>
                                <TouchableOpacity
                                    onPress={() => onSelect(iso)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel={iso}
                                    accessibilityState={{ selected: isEndpoint }}
                                    style={[
                                        styles.day,
                                        isFill && styles.inRange,
                                        isToday && !isEndpoint && styles.today,
                                        isEndpoint && styles.endpoint,
                                    ]}
                                >
                                    <Text
                                        variant="meta"
                                        tone={isEndpoint ? 'onAccent' : 'primary'}
                                    >
                                        {day}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};

export default Calendar;

import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Text from './Text';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { RADIUS, SPACING } from '../../constants/tokens';
import { buildTreemap } from '../../utils/treemap';

/**
 * Part-to-whole by area.
 *
 * Reaches for area over a stacked bar when there are more than about four
 * shares: past that a bar's segments get too thin to compare and the labels
 * stop fitting, while area stays readable down to a few percent.
 *
 * Colour is identity, passed in per item — never derived from rank here, so
 * re-sorting or filtering the data cannot repaint the survivors.
 *
 * Layout is in utils/treemap.js, tested off-device. This file is only paint.
 */

/**
 * Gap between tiles, in points. Applied as an inset on each tile rather than as
 * a margin, so the tiles still cover exactly the box the layout computed and
 * the areas stay honest.
 */
const GAP = 3;

// Below these a label is clipped rather than truncated, which reads as a
// rendering bug. The rows underneath carry every value anyway, so a bare tile
// loses nothing.
const MIN_W_FOR_LABEL = 56;
const MIN_H_FOR_LABEL = 34;
const MIN_H_FOR_VALUE = 54;

const makeStyles = () => StyleSheet.create({
    canvas: { position: 'relative' },
    tile: {
        position: 'absolute',
        borderRadius: RADIUS.SMALL,
        padding: SPACING.SMALL,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
});

const Treemap = ({
    data = [],
    width,
    height = 200,
    activeKey = null,
    onSelect,
    formatValue = (v) => String(v),
    maxTiles,
    otherLabel,
    style,
}) => {
    const theme = useTheme();
    const styles = useThemedStyles(makeStyles);

    const tiles = useMemo(
        () => buildTreemap(data, { w: width, h: height }, { maxTiles, otherLabel }),
        [data, width, height, maxTiles, otherLabel]
    );

    if (tiles.length === 0) return null;

    return (
        <View style={[styles.canvas, { width, height }, style]}>
            {tiles.map((tile) => {
                const fill = tile.color || theme.CATEGORY_OTHER;
                const w = tile.w - GAP;
                const h = tile.h - GAP;
                const showLabel = w >= MIN_W_FOR_LABEL && h >= MIN_H_FOR_LABEL;
                const showValue = showLabel && h >= MIN_H_FOR_VALUE;
                const label = tile.label || tile.key;
                const dimmed = activeKey != null && activeKey !== tile.key;

                return (
                    <TouchableOpacity
                        key={tile.key}
                        style={[
                            styles.tile,
                            {
                                left: tile.x + GAP / 2,
                                top: tile.y + GAP / 2,
                                width: w,
                                height: h,
                                backgroundColor: fill,
                                // Dimming rather than hiding: the shape of the
                                // month stays legible while one share is picked out.
                                opacity: dimmed ? 0.35 : 1,
                            },
                        ]}
                        onPress={() => onSelect?.(activeKey === tile.key ? null : tile.key)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeKey === tile.key }}
                        // Spoken even when the tile is too small to carry text.
                        accessibilityLabel={
                            `${label}, ${formatValue(tile.value)}, ${Math.round(tile.share * 100)}%`
                        }
                    >
                        {showLabel && (
                            <>
                                {/*
                                  * TEXT_ON_CATEGORY flips per mode because the two
                                  * ramps sit on opposite sides of mid-lightness.
                                  * Against the dark ramp it clears 6:1; against the
                                  * light ramp three hues land near 4.1:1, which is
                                  * why the category rows below this chart matter —
                                  * they are the readable copy of the same numbers.
                                  */}
                                <Text
                                    variant="label"
                                    color={theme.TEXT_ON_CATEGORY}
                                    numberOfLines={1}
                                >
                                    {label}
                                </Text>
                                {showValue && (
                                    <Text variant="meta" color={theme.TEXT_ON_CATEGORY} numberOfLines={1}>
                                        {formatValue(tile.value)}
                                    </Text>
                                )}
                            </>
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

export default Treemap;

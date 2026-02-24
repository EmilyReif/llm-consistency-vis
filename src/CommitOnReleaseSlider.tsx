import React, { useState } from "react";
import Slider, { SliderProps } from "@mui/material/Slider";

/**
 * Slider that only commits value (and calls onChangeCommitted) when the user
 * releases the mouse/pointer, while still providing smooth visual feedback during drag.
 */
export function CommitOnReleaseSlider(
  props: Omit<SliderProps, "onChange" | "onChangeCommitted"> & {
    value: number | number[];
    onChange?: (event: Event | React.SyntheticEvent, value: number | number[]) => void;
    onChangeCommitted?: (event: Event | React.SyntheticEvent, value: number | number[]) => void;
  }
) {
  const { value, onChange, onChangeCommitted, ...rest } = props;
  const [draft, setDraft] = useState<number | number[] | null>(null);
  const displayValue = draft ?? value;

  return (
    <Slider
      {...rest}
      value={displayValue}
      onChange={(e, v) => {
        setDraft(v);
        onChange?.(e, v);
      }}
      onChangeCommitted={(e, v) => {
        setDraft(null);
        onChangeCommitted?.(e, v);
      }}
    />
  );
}

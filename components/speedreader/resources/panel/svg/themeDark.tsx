// Copyright (c) 2022 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// you can obtain one at https://mozilla.org/MPL/2.0/.
import * as React from 'react'

const SvgComponent = () => (
  <svg
    width={88}
    height={50}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path fill="#1E2029" d="M11 0h66v50H11z" />
    <rect
      opacity={0.6}
      x={22}
      y={13}
      width={44}
      height={4}
      rx={2}
      fill="#F0F2FF"
    />
    <rect
      opacity={0.6}
      x={22}
      y={22}
      width={40}
      height={4}
      rx={2}
      fill="#C2C4CF"
    />
    <rect
      opacity={0.6}
      x={22}
      y={31}
      width={36}
      height={4}
      rx={2}
      fill="#C2C4CF"
    />
  </svg>
)

export default SvgComponent

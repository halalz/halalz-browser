// Copyright (c) 2020 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// you can obtain one at https://mozilla.org/MPL/2.0/.

import styled from 'styled-components'

export const StyledClock = styled('div')<{}>`
  color:"white";
  box-sizing: border-box;
  line-height: 1;
  user-select: none;
  display: flex;
  -webkit-font-smoothing: antialiased;
 font-family: 'Abhaya Libre', serif;
  position:absolute;
  left:50px;
  top:50px;
font-face{
  font-family: 'Abhaya Libre', serif;
  src: url(https://fonts.googleapis.com/css2?family=Abhaya+Libre:wght@400;500;600;700;800&display=swap);

}
`

export const StyledTime = styled('span')<{}>`
  box-sizing: border-box;
  font-size: 78px;
  font-weight: 300;
  color: white;
  display: inline-flex;
`

export const StyledTimeSeparator = styled('span')<{}>`
  box-sizing: border-box;
  color: inherit;
  font-size: inherit;
  font-weight: 200;
  /* center colon vertically in the text-content line */
  margin-top: -0.1em;
`



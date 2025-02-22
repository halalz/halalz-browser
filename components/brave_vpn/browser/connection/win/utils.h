/* Copyright (c) 2022 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef BRAVE_COMPONENTS_BRAVE_VPN_BROWSER_CONNECTION_WIN_UTILS_H_
#define BRAVE_COMPONENTS_BRAVE_VPN_BROWSER_CONNECTION_WIN_UTILS_H_

#include <string>

#include "base/win/windows_types.h"

namespace brave_vpn {

namespace internal {

enum class CheckConnectionResult {
  CONNECTED,
  CONNECTING,
  CONNECT_FAILED,
  DISCONNECTING,
  DISCONNECTED,
};

struct RasOperationResult {
  bool success;
  // If not success, store user friendly error description.
  std::string error_description;
};

// Returns human readable error description.
std::string GetRasErrorMessage(DWORD error);
std::wstring GetPhonebookPath(const std::wstring& entry_name);

RasOperationResult CreateEntry(const std::wstring& entry_name,
                               const std::wstring& hostname,
                               const std::wstring& username,
                               const std::wstring& password);
RasOperationResult RemoveEntry(const std::wstring& entry_name);
RasOperationResult DisconnectEntry(const std::wstring& entry_name);
RasOperationResult ConnectEntry(const std::wstring& entry_name);
CheckConnectionResult CheckConnection(const std::wstring& entry_name);

}  // namespace internal

}  // namespace brave_vpn

#endif  // BRAVE_COMPONENTS_BRAVE_VPN_BROWSER_CONNECTION_WIN_UTILS_H_

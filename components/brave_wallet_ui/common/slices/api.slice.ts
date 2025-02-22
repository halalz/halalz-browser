// Copyright (c) 2022 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// you can obtain one at https://mozilla.org/MPL/2.0/.

import { EntityId } from '@reduxjs/toolkit'
import { createApi } from '@reduxjs/toolkit/query/react'

// types
import {
  BraveWallet,
  ERC721Metadata,
  SupportedCoinTypes,
  WalletInfoBase
} from '../../constants/types'
import {
  IsEip1559Changed,
  SetUserAssetVisiblePayloadType
} from '../constants/action_types'

// entities
import {
  networkEntityAdapter,
  networkEntityInitalState,
  NetworkEntityAdaptorState
} from './entities/network.entity'
import {
  AccountInfoEntityState,
  accountInfoEntityAdaptor,
  accountInfoEntityAdaptorInitialState,
  AccountInfoEntity
} from './entities/account-info.entity'
import {
  blockchainTokenEntityAdaptor,
  blockchainTokenEntityAdaptorInitialState,
  BlockchainTokenEntityAdaptorState
} from './entities/blockchain-token.entity'
import { AccountTokenBalanceForChainId } from './entities/token-balance.entity'

// utils
import { cacher } from '../../utils/query-cache-utils'
import getAPIProxy from '../async/bridge'
import WalletApiProxy from '../wallet_api_proxy'
import {
  addChainIdToToken,
  addLogoToToken,
  getAssetIdKey,
  GetBlockchainTokenIdArg,
  isNativeAsset
} from '../../utils/asset-utils'
import { getEntitiesListFromEntityState } from '../../utils/entities.utils'
import { makeNetworkAsset } from '../../options/asset-options'
import { getTokenParam } from '../../utils/api-utils'
import { getAccountType } from '../../utils/account-utils'
import { getFilecoinKeyringIdFromNetwork } from '../../utils/network-utils'
import Amount from '../../utils/amount'

export type AssetPriceById = BraveWallet.AssetPrice & {
  id: EntityId
  fromAssetId: EntityId
}

/**
 * A function to return the ref to either the main api proxy, or a mocked proxy
 * @returns function that returns an ApiProxy instance
 */
let apiProxyFetcher = () => getAPIProxy()

const emptyBalance = '0x0'

type GetTokenCurrentBalanceArg = {
  token: GetBlockchainTokenIdArg & Pick<BraveWallet.BlockchainToken, 'isNft'>
  account: Pick<AccountInfoEntity, 'address' | 'coin' | 'keyringId'>
}

type GetCombinedTokenBalanceForAllAccounts =
  GetTokenCurrentBalanceArg['token'] & Pick<BraveWallet.BlockchainToken, 'coin'>

export function createWalletApi (
  getProxy: () => WalletApiProxy = () => getAPIProxy()
) {
  apiProxyFetcher = getProxy // update the proxy whenever a new api is created

  const walletApi = createApi({
    reducerPath: 'walletApi',
    baseQuery: () => {
      return { data: apiProxyFetcher() }
    },
    tagTypes: [
      ...cacher.defaultTags,
      'AccountInfos',
      'ChainIdForCoinType',
      'DefaultAccountAddresses',
      'DefaultFiatCurrency',
      'ERC721Metadata',
      'KnownBlockchainTokens',
      'Network',
      'SelectedAccountAddress',
      'SelectedChainId',
      'SelectedCoin',
      'TokenSpotPrice',
      'UserBlockchainTokens',
      'WalletInfo'
    ],
    endpoints: ({ mutation, query }) => ({
      //
      // Accounts & Wallet Info
      //
      getWalletInfoBase: query<WalletInfoBase, void>({
        async queryFn (arg, api, extraOptions, baseQuery) {
          const { walletHandler } = baseQuery(undefined).data
          const walletInfo: WalletInfoBase = await walletHandler.getWalletInfo()
          return {
            data: walletInfo
          }
        },
        providesTags: ['WalletInfo']
      }),
      getAccountInfosRegistry: query<AccountInfoEntityState, void>({
        async queryFn (arg, { dispatch }, extraOptions, baseQuery) {
          const walletInfo: WalletInfoBase = await dispatch(
            walletApi.endpoints.getWalletInfoBase.initiate()
          ).unwrap()
          const accountInfos = walletInfo.accountInfos.map<AccountInfoEntity>(
            (info) => {
              return {
                ...info,
                accountType: getAccountType(info),
                deviceId: info.hardware ? info.hardware.deviceId : ''
              }
            }
          )
          return {
            data: accountInfoEntityAdaptor.setAll(
              accountInfoEntityAdaptorInitialState,
              accountInfos
            )
          }
        },
        providesTags: cacher.providesRegistry('AccountInfos')
      }),
      getDefaultAccountAddresses: query<string[], void>({
        async queryFn (arg, { dispatch }, extraOptions, baseQuery) {
          const { keyringService } = baseQuery(undefined).data // apiProxy

          // Get default account addresses for each CoinType
          const defaultAccountAddresses = await Promise.all(
            SupportedCoinTypes.map(async (coin: BraveWallet.CoinType) => {
              const chainId: string = await dispatch(
                walletApi.endpoints.getChainIdForCoin.initiate(coin)
              ).unwrap()
              const defaultAccount =
                coin === BraveWallet.CoinType.FIL
                  ? await keyringService.getFilecoinSelectedAccount(chainId)
                  : await keyringService.getSelectedAccount(coin)
              return defaultAccount.address
            })
          )

          // remove empty addresses
          const filteredDefaultAccountAddresses =
            defaultAccountAddresses.filter(
              (account: string | null): account is string =>
                account !== null && account !== ''
            )

          return {
            data: filteredDefaultAccountAddresses
          }
        },
        providesTags: ['DefaultAccountAddresses']
      }),
      setSelectedAccount: mutation<
        string,
        {
          address: string
          coin: BraveWallet.CoinType
        }
      >({
        async queryFn ({ address, coin }, api, extraOptions, baseQuery) {
          const { keyringService } = baseQuery(undefined).data // apiProxy
          await keyringService.setSelectedAccount(address, coin)
          return {
            data: address
          }
        },
        invalidatesTags: ['SelectedAccountAddress']
      }),
      getSelectedAccountAddress: query<string, void>({
        async queryFn (arg, { dispatch }, extraOptions, baseQuery) {
          const { keyringService } = baseQuery(undefined).data // apiProxy

          const selectedCoin: number = await dispatch(
            walletApi.endpoints.getSelectedCoin.initiate()
          ).unwrap()

          let selectedAddress: string | null = null
          if (selectedCoin === BraveWallet.CoinType.FIL) {
            const chainId: string = await dispatch(
              walletApi.endpoints.getChainIdForCoin.initiate(selectedCoin)
            ).unwrap()
            selectedAddress = (
              await keyringService.getFilecoinSelectedAccount(chainId)
            ).address
          } else {
            selectedAddress = (
              await keyringService.getSelectedAccount(selectedCoin)
            ).address
          }

          const accountsRegistry: AccountInfoEntityState = await dispatch(
            walletApi.endpoints.getAccountInfosRegistry.initiate()
          ).unwrap()
          const fallbackAccount = accountsRegistry[accountsRegistry.ids[0]]

          if (
            // If the selected address is null, set the selected account address to the fallback address
            selectedAddress === null ||
            selectedAddress === '' ||
            // If a user has already created an wallet but then chooses to restore
            // a different wallet, getSelectedAccount still returns the previous wallets
            // selected account.
            // This check looks to see if the returned selectedAccount exist in the accountInfos
            // payload, if not it will setSelectedAccount to the fallback address
            !accountsRegistry.ids.find(
              (accountId) =>
                String(accountId).toLowerCase() ===
                selectedAddress?.toLowerCase()
            )
          ) {
            await dispatch(
              walletApi.endpoints.setSelectedAccount.initiate(fallbackAccount)
            )
            return {
              data: fallbackAccount.address
            }
          }

          return {
            data: selectedAddress
          }
        },
        providesTags: ['SelectedAccountAddress']
      }),
      //
      // Default Currencies
      //
      getDefaultFiatCurrency: query<string, void>({
        async queryFn (arg, api, extraOptions, baseQuery) {
          try {
            const { braveWalletService } = baseQuery(undefined).data
            const { currency } =
              await braveWalletService.getDefaultBaseCurrency()
            const defaultFiatCurrency = currency.toLowerCase()
            return {
              data: defaultFiatCurrency
            }
          } catch (error) {
            return {
              error: 'Unable to fetch default fiat currency'
            }
          }
        },
        providesTags: ['DefaultFiatCurrency']
      }),
      setDefaultFiatCurrency: mutation<string, string>({
        async queryFn (currencyArg, api, extraOptions, baseQuery) {
          try {
            const { braveWalletService } = baseQuery(undefined).data
            braveWalletService.setDefaultBaseCurrency(currencyArg)
            return {
              data: currencyArg
            }
          } catch (error) {
            return {
              error: `Unable to set default fiat currency to ${currencyArg}`
            }
          }
        },
        invalidatesTags: ['DefaultFiatCurrency']
      }),
      //
      // Networks
      //
      getHiddenNetworkChainIdsForCoin: query<string[], BraveWallet.CoinType>({
        async queryFn (coinTypeArg, api, extraOptions, baseQuery) {
          try {
            const { jsonRpcService } = baseQuery(undefined).data
            const { chainIds } = await jsonRpcService.getHiddenNetworks(
              coinTypeArg
            )
            return {
              data: chainIds
            }
          } catch (error) {
            return {
              error: `Unable to fetch HiddenNetworkChainIdsForCoin for coin: ${coinTypeArg}`
            }
          }
        }
      }),
      getAllNetworks: query<NetworkEntityAdaptorState, void>({
        async queryFn (arg, { dispatch }, extraOptions, baseQuery) {
          try {
            const { jsonRpcService } = baseQuery(undefined).data

            // network type flags
            const { isFilecoinEnabled, isSolanaEnabled } = await dispatch(
              walletApi.endpoints.getWalletInfoBase.initiate()
            ).unwrap()

            // Get all networks
            const filteredSupportedCoinTypes = SupportedCoinTypes.filter(
              (coin) => {
                // FIL and SOL networks, unless enabled by halalz://flags
                return (
                  (coin === BraveWallet.CoinType.FIL && isFilecoinEnabled) ||
                  (coin === BraveWallet.CoinType.SOL && isSolanaEnabled) ||
                  coin === BraveWallet.CoinType.ETH
                )
              }
            )

            const idsByCoinType: Record<EntityId, EntityId[]> = {}

            // Get all networks for supported coin types
            const networkLists: BraveWallet.NetworkInfo[][] = await Promise.all(
              filteredSupportedCoinTypes.map(
                async (coin: BraveWallet.CoinType) => {
                  const { networks } = await jsonRpcService.getAllNetworks(coin)

                  const { getHiddenNetworkChainIdsForCoin } =
                    walletApi.endpoints

                  const hiddenChains: string[] = await dispatch(
                    getHiddenNetworkChainIdsForCoin.initiate(coin)
                  ).unwrap()

                  const availableNetworks = networks.filter((n) =>
                    !hiddenChains.includes(n.chainId)
                  )

                  idsByCoinType[coin] = availableNetworks.map(n => n.chainId)

                  return availableNetworks
                }
              )
            )
            const networksList = networkLists.flat(1)

            // normalize list into a registry
            const normalizedNetworksState = networkEntityAdapter.setAll(
              networkEntityInitalState,
              networksList
            )
            return {
              data: normalizedNetworksState
            }
          } catch (error) {
            return {
              error: `Unable to fetch AllNetworks ${error}`
            }
          }
        },
        providesTags: cacher.providesRegistry('Network')
      }),
      getChainIdForCoin: query<string, BraveWallet.CoinType>({
        async queryFn (arg, api, extraOptions, baseQuery) {
          const { jsonRpcService } = baseQuery(undefined).data // apiProxy
          const { chainId } = await jsonRpcService.getChainId(arg)
          return {
            data: chainId
          }
        },
        providesTags: cacher.cacheByIdArg('ChainIdForCoinType')
      }),
      getSelectedChainId: query<string, void>({
        async queryFn (arg, { dispatch }, extraOptions, baseQuery) {
          const selectedCoin: number = await dispatch(
            walletApi.endpoints.getSelectedCoin.initiate()
          ).unwrap()
          const chainId: string = await dispatch(
            walletApi.endpoints.getChainIdForCoin.initiate(selectedCoin)
          ).unwrap()
          return {
            data: chainId
          }
        },
        providesTags: ['SelectedChainId']
      }),
      getSelectedCoin: query<BraveWallet.CoinType, void>({
        async queryFn (arg, api, extraOptions, baseQuery) {
          try {
            const apiProxy = baseQuery(undefined).data
            const { braveWalletService } = apiProxy
            const { coin } = await braveWalletService.getSelectedCoin()
            return { data: coin }
          } catch (error) {
            return {
              error: `Unable to fetch selectedCoin: ${error}`
            }
          }
        },
        providesTags: ['SelectedCoin']
      }),
      setSelectedCoin: mutation<BraveWallet.CoinType, BraveWallet.CoinType>({
        queryFn (coinTypeArg, api, extraOptions, baseQuery) {
          try {
            const { braveWalletService } = baseQuery(undefined).data
            braveWalletService.setSelectedCoin(coinTypeArg)
            return { data: coinTypeArg }
          } catch (error) {
            return {
              error: `Unable to mutate selectedCoin: ${error}`
            }
          }
        },
        invalidatesTags: ['SelectedCoin']
      }),
      isEip1559Changed: mutation<
        { id: string, isEip1559: boolean },
        IsEip1559Changed
      >({
        async queryFn (arg) {
          const { chainId, isEip1559 } = arg
          // cache which chains are using EIP1559
          return {
            data: { id: chainId, isEip1559 } // invalidate the cache of the network with this chainId
          }
        },
        async onQueryStarted (
          { chainId, isEip1559 },
          { dispatch, queryFulfilled }
        ) {
          // optimistic updates
          // try manually updating the cached network with the updated isEip1559 value
          const patchResult = dispatch(
            walletApi.util.updateQueryData(
              'getAllNetworks',
              undefined,
              (draft) => {
                const draftNet = draft.entities[chainId]
                if (draftNet) {
                  draftNet.isEip1559 = isEip1559
                }
              }
            )
          )

          try {
            await queryFulfilled
          } catch {
            // undo the optimistic update if the mutation failed
            patchResult.undo()
          }
        },
        invalidatesTags: cacher.invalidatesList('Network')
      }),
      //
      // Prices
      //
      getTokenSpotPrice: query<AssetPriceById, GetBlockchainTokenIdArg>({
        async queryFn (tokenArg, { dispatch }, extraOptions, baseQuery) {
          try {
            const { assetRatioService } = baseQuery(undefined).data

            const defaultFiatCurrency = await dispatch(
              walletApi.endpoints.getDefaultFiatCurrency.initiate()
            ).unwrap()

            // send the correct token identifier to the ratio service
            const getPriceTokenParam = getTokenParam(tokenArg)

            // create a cache id using the provided args
            const tokenPriceCacheId = `${getPriceTokenParam}-${defaultFiatCurrency}`

            const { success, values } = await assetRatioService.getPrice(
              [getPriceTokenParam],
              [defaultFiatCurrency],
              0
            )

            if (!success || !values[0]) {
              throw new Error()
            }

            const tokenPrice: AssetPriceById = {
              id: tokenPriceCacheId,
              ...values[0],
              fromAsset: tokenArg.symbol.toLowerCase(),
              fromAssetId: getAssetIdKey(tokenArg)
            }

            return {
              data: tokenPrice
            }
          } catch (error) {
            return {
              error: `Unable to find price for token ${tokenArg.symbol}`
            }
          }
        },
        providesTags: cacher.cacheByIdResultProperty('TokenSpotPrice')
      }),
      //
      // Tokens
      //
      getTokensRegistry: query<BlockchainTokenEntityAdaptorState, void>({
        async queryFn (arg, { dispatch }, extraOptions, baseQuery) {
          try {
            const { blockchainRegistry } = baseQuery(undefined).data
            const networksState: NetworkEntityAdaptorState = await dispatch(
              walletApi.endpoints.getAllNetworks.initiate()
            ).unwrap()

            const networksList: BraveWallet.NetworkInfo[] =
              getEntitiesListFromEntityState(networksState)

            const tokenIdsByChainId: Record<string, string[]> = {}

            const tokenListsForNetworks = await Promise.all(
              networksList.map(async (network) => {
                const { tokens } = await blockchainRegistry.getAllTokens(
                  network.chainId,
                  network.coin
                )

                const fullTokensListForNetwork: BraveWallet.BlockchainToken[] = tokens.map(token => {
                  return addChainIdToToken(
                    addLogoToToken(token),
                    network.chainId
                  )
                })

                tokenIdsByChainId[network.chainId] =
                  fullTokensListForNetwork.map(getAssetIdKey)

                return fullTokensListForNetwork
              })
            )

            const flattendTokensList = tokenListsForNetworks.flat(1)

            if (flattendTokensList.length === 0) {
              throw new Error()
            }

            const tokensByChainIdRegistry = blockchainTokenEntityAdaptor.setAll(
              {
                ...blockchainTokenEntityAdaptorInitialState,
                idsByChainId: tokenIdsByChainId
              },
              flattendTokensList
            )

            return {
              data: tokensByChainIdRegistry
            }
          } catch (error) {
            return {
              error: 'Unable to fetch Tokens Registry'
            }
          }
        },
        providesTags: cacher.providesRegistry('KnownBlockchainTokens')
      }),
      getUserTokensRegistry: query<BlockchainTokenEntityAdaptorState, void>({
        async queryFn (arg, { dispatch }, extraOptions, baseQuery) {
          try {
            const { braveWalletService } = baseQuery(undefined).data
            const networksState: NetworkEntityAdaptorState = await dispatch(
              walletApi.endpoints.getAllNetworks.initiate()
            ).unwrap()
            const networksList: BraveWallet.NetworkInfo[] =
              getEntitiesListFromEntityState(networksState)

            const tokenIdsByChainId: Record<string, string[]> = {}
            const visibleTokenIds: string[] = []
            const visibleTokenIdsByChainId: Record<string, string[]> = {}

            const userTokenListsForNetworks = await Promise.all(
              networksList.map(async (network) => {
                const fullTokensListForNetwork: BraveWallet.BlockchainToken[] =
                  await fetchUserAssetsForNetwork(braveWalletService, network)

                tokenIdsByChainId[network.chainId] =
                  fullTokensListForNetwork.map(getAssetIdKey)

                const visibleTokensForNetwork: BraveWallet.BlockchainToken[] =
                  fullTokensListForNetwork.filter((t) => t.visible)

                visibleTokenIdsByChainId[network.chainId] =
                  visibleTokensForNetwork.map(getAssetIdKey)

                visibleTokenIds.push(
                  ...visibleTokenIdsByChainId[network.chainId]
                )

                return fullTokensListForNetwork
              })
            )

            const userTokensByChainIdRegistry =
              blockchainTokenEntityAdaptor.setAll(
                {
                  ...blockchainTokenEntityAdaptorInitialState,
                  idsByChainId: tokenIdsByChainId,
                  tokenIdsByChainId,
                  visibleTokenIds,
                  visibleTokenIdsByChainId
                },
                userTokenListsForNetworks.flat(1)
              )

            return {
              data: userTokensByChainIdRegistry
            }
          } catch (error) {
            return {
              error: 'Unable to fetch UserTokens Registry'
            }
          }
        },
        providesTags: cacher.providesRegistry('UserBlockchainTokens')
      }),
      getERC721Metadata: query<
        {
          id: EntityId
          metadata?: ERC721Metadata
        },
        GetBlockchainTokenIdArg
      >({
        async queryFn (tokenArg, api, extraOptions, baseQuery) {
          if (!tokenArg.isErc721) {
            return {
              error: 'Cannot fetch erc-721 metadata for non erc-721 token'
            }
          }

          const { jsonRpcService } = baseQuery(undefined).data

          const result = await jsonRpcService.getERC721Metadata(
            tokenArg.contractAddress,
            tokenArg.tokenId,
            tokenArg.chainId
          )

          if (result.error || result.errorMessage) {
            return { error: result.errorMessage }
          }

          try {
            const metadata: ERC721Metadata = JSON.parse(result.response)
            return {
              data: {
                id: blockchainTokenEntityAdaptor.selectId(tokenArg),
                metadata
              }
            }
          } catch (error) {
            return {
              error: `error parsing erc721 metadata result: ${result.response}`
            }
          }
        },
        providesTags: (result, error, tokenQueryArg) => {
          const tag = {
            type: 'ERC721Metadata',
            id: blockchainTokenEntityAdaptor.selectId(tokenQueryArg)
          } as const

          return error ? [tag, 'UNKNOWN_ERROR'] : [tag]
        }
      }),
      addUserToken: mutation<{ id: EntityId }, BraveWallet.BlockchainToken>({
        async queryFn (tokenArg, { dispatch }, extraOptions, baseQuery) {
          const { braveWalletService } = baseQuery(undefined).data
          if (tokenArg.isErc721) {
            // Get NFTMetadata
            const { metadata } = await dispatch(
              walletApi.endpoints.getERC721Metadata.initiate({
                chainId: tokenArg.chainId,
                contractAddress: tokenArg.contractAddress,
                isErc721: tokenArg.isErc721,
                tokenId: tokenArg.tokenId,
                symbol: tokenArg.symbol
              })
            ).unwrap()

            if (metadata?.image) {
              tokenArg.logo = metadata?.image || tokenArg.logo
            }
          }

          const result = await braveWalletService.addUserAsset(tokenArg)
          const tokenIdentifier =
            blockchainTokenEntityAdaptor.selectId(tokenArg)

          if (!result.success) {
            return {
              error: `Error adding user token: ${tokenIdentifier}`
            }
          }

          return {
            data: { id: tokenIdentifier }
          }
        },
        invalidatesTags: cacher.invalidatesList('UserBlockchainTokens')
      }),
      removeUserToken: mutation<boolean, BraveWallet.BlockchainToken>({
        async queryFn (tokenArg, api, extraOptions, baseQuery) {
          const { braveWalletService } = baseQuery(undefined).data
          try {
            const deleteResult = await braveWalletService.removeUserAsset(
              tokenArg
            )
            if (!deleteResult.success) {
              throw new Error()
            }
            return {
              data: true
            }
          } catch (error) {
            return {
              error: `Unable to remove user asset: ${getAssetIdKey(tokenArg)}`
            }
          }
        },
        invalidatesTags: cacher.invalidatesList('UserBlockchainTokens')
      }),
      updateUserToken: mutation<{ id: EntityId }, BraveWallet.BlockchainToken>({
        async queryFn (tokenArg, { dispatch }, extraOptions, baseQuery) {
          const deleted = await dispatch(
            walletApi.endpoints.removeUserToken.initiate(tokenArg)
          ).unwrap()
          if (deleted) {
            const result: { id: EntityId } = await dispatch(
              walletApi.endpoints.addUserToken.initiate(tokenArg)
            ).unwrap()
            return { data: { id: result.id } }
          }
          return {
            error: `unable to update token ${getAssetIdKey(tokenArg)}`
          }
        },
        invalidatesTags: (_, __, tokenArg) => [
          { type: 'UserBlockchainTokens', id: getAssetIdKey(tokenArg) }
        ],
        async onQueryStarted (tokenArg, { queryFulfilled, dispatch }) {
          const patchResult = dispatch(
            walletApi.util.updateQueryData(
              'getUserTokensRegistry',
              undefined,
              (draft) => {
                const tokenIdentifier =
                  blockchainTokenEntityAdaptor.selectId(tokenArg)
                draft.entities[tokenIdentifier] = tokenArg
              }
            )
          )
          try {
            await queryFulfilled
          } catch (error) {
            patchResult.undo()
          }
        }
      }),
      updateUserAssetVisible: mutation<boolean, SetUserAssetVisiblePayloadType>(
        {
          async queryFn ({ isVisible, token }, api, extraOptions, baseQuery) {
            try {
              const { braveWalletService } = baseQuery(undefined).data
              const { success } = await braveWalletService.setUserAssetVisible(
                token,
                isVisible
              )
              return { data: success }
            } catch (error) {
              return {
                error: `Could not user update asset visibility for token: ${
                  getAssetIdKey(token) // token identifier
                }`
              }
            }
          },
          invalidatesTags: cacher.invalidatesList('UserBlockchainTokens')
        }
      ),
      //
      // Token balances
      //
      getTokenCurrentBalance: query<
        AccountTokenBalanceForChainId,
        GetTokenCurrentBalanceArg
      >({
        async queryFn (
          { account, token },
          { dispatch },
          extraOptions,
          baseQuery
        ) {
          const { jsonRpcService } = baseQuery(undefined).data // apiProxy

          // entity lookup ids
          const accountEntityId: EntityId = accountInfoEntityAdaptor.selectId({
            address: account.address
          })
          const chainId: EntityId = token?.chainId ?? ''
          const tokenEntityId: EntityId =
            blockchainTokenEntityAdaptor.selectId(token)

          // create default response
          const emptyBalanceResult: AccountTokenBalanceForChainId = {
            accountEntityId,
            balance: emptyBalance,
            chainId,
            tokenEntityId
          }

          // Native asset balances
          if (isNativeAsset(token)) {
            // get networks
            const networksRegistry: NetworkEntityAdaptorState = await dispatch(
              walletApi.endpoints.getAllNetworks.initiate()
            ).unwrap()

            const network: BraveWallet.NetworkInfo | undefined =
            networksRegistry.entities[token.chainId]

            if (!network) {
              return {
                error: `Network not found for chain id: ${token.chainId}`
              }
            }

            const nativeAssetDefaultBalanceResult = emptyBalanceResult

            // LOCALHOST
            if (
              token.chainId === BraveWallet.LOCALHOST_CHAIN_ID &&
              network.coin !== BraveWallet.CoinType.SOL
            ) {
              const { balance, error, errorMessage } =
                await jsonRpcService.getBalance(
                  account.address,
                  network.coin,
                  network.chainId
                )

              // LOCALHOST will error until a local instance is detected
              // return a '0' balance until it's detected.
              if (error !== 0) {
                return {
                  error: errorMessage
                }
              }

              return {
                data: {
                  ...nativeAssetDefaultBalanceResult,
                  balance
                }
              }
            }

            switch (network.coin) {
              case BraveWallet.CoinType.SOL: {
                const { balance, error } =
                  await jsonRpcService.getSolanaBalance(
                    account.address,
                    network.chainId
                  )

                if (
                  network?.chainId === BraveWallet.LOCALHOST_CHAIN_ID &&
                  error !== 0
                ) {
                  return { data: emptyBalanceResult }
                }

                return {
                  data: {
                    ...nativeAssetDefaultBalanceResult,
                    balance: balance.toString()
                  } as AccountTokenBalanceForChainId
                }
              }

              case BraveWallet.CoinType.FIL:
              case BraveWallet.CoinType.ETH:
              default: {
                if (BraveWallet.CoinType.FIL) {
                  // Get network keyring id
                  const filecoinKeyringIdFromNetwork =
                    getFilecoinKeyringIdFromNetwork({
                      chainId: token.chainId,
                      coin: account.coin
                    })

                  if (account.keyringId !== filecoinKeyringIdFromNetwork) {
                    return { data: emptyBalanceResult }
                  }
                }

                const { balance, error, errorMessage } =
                  await jsonRpcService.getBalance(
                    account.address,
                    network.coin,
                    token.chainId
                  )

                if (error && errorMessage) {
                  return {
                    error: errorMessage
                  }
                }

                return {
                  data: {
                    ...nativeAssetDefaultBalanceResult,
                    balance
                  } as AccountTokenBalanceForChainId
                }
              }
            }
          }

          // Token Balances
          const tokenDefaultBalanceResult = emptyBalanceResult

          switch (account.coin) {
            // Ethereum Network tokens
            case BraveWallet.CoinType.ETH: {
              const { balance, error, errorMessage } = token.isErc721
                ? await jsonRpcService.getERC721TokenBalance(
                    token.contractAddress,
                    token.tokenId ?? '',
                    account.address,
                    chainId
                  )
                : await jsonRpcService.getERC20TokenBalance(
                    token.contractAddress,
                    account.address,
                    token?.chainId ?? ''
                  )

              if (error && errorMessage) {
                return { error: errorMessage }
              }

              return {
                data: {
                  ...tokenDefaultBalanceResult,
                  balance
                } as AccountTokenBalanceForChainId
              }
            }
            // Solana Network Tokens
            case BraveWallet.CoinType.SOL: {
              const { amount, uiAmountString, error, errorMessage } =
                await jsonRpcService.getSPLTokenAccountBalance(
                  account.address,
                  token.contractAddress,
                  token.chainId
                )

              if (error && errorMessage) {
                return { error: errorMessage }
              }

              const accountTokenBalance: AccountTokenBalanceForChainId = {
                ...tokenDefaultBalanceResult,
                balance: token.isNft ? uiAmountString : amount
              }

              return {
                data: accountTokenBalance
              }
            }

            // Other network type tokens
            default: return {
              data: emptyBalanceResult
            }
          }
        }
      }),
      getCombinedTokenBalanceForAllAccounts: query<
        string,
        GetCombinedTokenBalanceForAllAccounts
      >({
        async queryFn (asset, { dispatch }, extraOptions, baseQuery) {
          const accountsRegistry: AccountInfoEntityState = await dispatch(
            walletApi.endpoints.getAccountInfosRegistry.initiate()
          ).unwrap()
          const accounts = getEntitiesListFromEntityState(accountsRegistry)

          const accountsForAssetCoinType = accounts.filter(
            (account) => account.coin === asset.coin
          )

          const accountTokenBalancesForChainId: string[] = await Promise.all(
            accountsForAssetCoinType.map(async (account) => {
              const balanceResult: AccountTokenBalanceForChainId =
                await dispatch(
                  walletApi.endpoints.getTokenCurrentBalance.initiate({
                    account: {
                      address: account.address,
                      coin: account.coin,
                      keyringId: account.keyringId
                    },
                    token: {
                      chainId: asset.chainId,
                      contractAddress: asset.contractAddress,
                      isErc721: asset.isErc721,
                      isNft: asset.isNft,
                      symbol: asset.symbol,
                      tokenId: asset.tokenId
                    }
                  })
                ).unwrap()

              return balanceResult?.balance ?? ''
            })
          )

          // return a '0' balance until user has created a FIL or SOL account
          if (accountTokenBalancesForChainId.length === 0) {
            return {
              data: '0'
            }
          }

          const aggregatedAmount = accountTokenBalancesForChainId.reduce(
            function (totalBalance, itemBalance) {
              return itemBalance !== ''
                ? new Amount(totalBalance).plus(itemBalance).format()
                : itemBalance ?? '0'
            },
            '0'
          )

          return {
            data: aggregatedAmount
          }
        }
      })
    })
  })
  return walletApi
}

export type WalletApi = ReturnType<typeof createWalletApi>
export const walletApi: WalletApi = createWalletApi()

export const {
  middleware: walletApiMiddleware,
  reducer: walletApiReducer,
  reducerPath: walletApiReducerPath,
  // hooks
  useAddUserTokenMutation,
  useGetAccountInfosRegistryQuery,
  useGetAllNetworksQuery,
  useGetChainIdForCoinQuery,
  useGetCombinedTokenBalanceForAllAccountsQuery,
  useGetDefaultAccountAddressesQuery,
  useGetDefaultFiatCurrencyQuery,
  useGetERC721MetadataQuery,
  useGetHiddenNetworkChainIdsForCoinQuery,
  useGetSelectedAccountAddressQuery,
  useGetSelectedChainIdQuery,
  useGetSelectedCoinQuery,
  useGetTokenCurrentBalanceQuery,
  useGetTokenSpotPriceQuery,
  useGetTokensRegistryQuery,
  useGetUserTokensRegistryQuery,
  useGetWalletInfoBaseQuery,
  useIsEip1559ChangedMutation,
  useLazyGetAccountInfosRegistryQuery,
  useLazyGetAllNetworksQuery,
  useLazyGetChainIdForCoinQuery,
  useLazyGetCombinedTokenBalanceForAllAccountsQuery,
  useLazyGetDefaultAccountAddressesQuery,
  useLazyGetDefaultFiatCurrencyQuery,
  useLazyGetERC721MetadataQuery,
  useLazyGetHiddenNetworkChainIdsForCoinQuery,
  useLazyGetSelectedAccountAddressQuery,
  useLazyGetSelectedChainIdQuery,
  useLazyGetSelectedCoinQuery,
  useLazyGetTokenCurrentBalanceQuery,
  useLazyGetTokenSpotPriceQuery,
  useLazyGetTokensRegistryQuery,
  useLazyGetUserTokensRegistryQuery,
  useLazyGetWalletInfoBaseQuery,
  usePrefetch,
  useRemoveUserTokenMutation,
  useSetDefaultFiatCurrencyMutation,
  useSetSelectedAccountMutation,
  useSetSelectedCoinMutation,
  useUpdateUserAssetVisibleMutation,
  useUpdateUserTokenMutation
} = walletApi

export type WalletApiSliceState = ReturnType<typeof walletApi['reducer']>
export type WalletApiSliceStateFromRoot = { walletApi: WalletApiSliceState }

//
// Internals
//

async function fetchUserAssetsForNetwork (
  braveWalletService: BraveWallet.BraveWalletServiceRemote,
  network: BraveWallet.NetworkInfo
) {
  // Get a list of user tokens for each coinType and network.
  const getTokenList = await braveWalletService.getUserAssets(
    network.chainId,
    network.coin
  )

  // Adds a logo and chainId to each token object
  const tokenList: BraveWallet.BlockchainToken[] = getTokenList.tokens.map(token => {
    const updatedToken = addLogoToToken(token)
    return addChainIdToToken(updatedToken, network.chainId)
  })

  if (tokenList.length === 0) {
    // Creates a network's Native Asset if nothing was returned
    const nativeAsset = makeNetworkAsset(network)
    nativeAsset.logo = network.iconUrls[0] ?? ''
    nativeAsset.visible = false
    return [nativeAsset]
  }

  return tokenList
}

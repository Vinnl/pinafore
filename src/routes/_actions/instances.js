import { getVerifyCredentials } from '../_api/user'
import { store } from '../_store/store'
import { switchToTheme } from '../_utils/themeEngine'
import { toast } from '../_components/toast/toast'
import { goto } from '../../../__sapper__/client'
import { cacheFirstUpdateAfter } from '../_utils/sync'
import { getInstanceInfo } from '../_api/instance'
import { database } from '../_database/database'
import { importVirtualListStore } from '../_utils/asyncModules'

export function changeTheme (instanceName, newTheme) {
  const { instanceThemes } = store.get()
  instanceThemes[instanceName] = newTheme
  store.set({ instanceThemes: instanceThemes })
  store.save()
  const { currentInstance } = store.get()
  if (instanceName === currentInstance) {
    const { enableGrayscale } = store.get()
    switchToTheme(newTheme, enableGrayscale)
  }
}

export function switchToInstance (instanceName) {
  const { instanceThemes } = store.get()
  store.set({
    currentInstance: instanceName,
    searchResults: null,
    queryInSearch: ''
  })
  store.save()
  const { enableGrayscale } = store.get()
  switchToTheme(instanceThemes[instanceName], enableGrayscale)
}

export async function logOutOfInstance (instanceName, message = `Logged out of ${instanceName}`) {
  const {
    composeData,
    currentInstance,
    customEmoji,
    instanceInfos,
    instanceLists,
    instanceThemes,
    loggedInInstances,
    loggedInInstancesInOrder,
    verifyCredentials
  } = store.get()
  loggedInInstancesInOrder.splice(loggedInInstancesInOrder.indexOf(instanceName), 1)
  const newInstance = instanceName === currentInstance ? loggedInInstancesInOrder[0] : currentInstance
  const objectsToClear = [
    composeData,
    customEmoji,
    instanceInfos,
    instanceLists,
    instanceThemes,
    loggedInInstances,
    verifyCredentials
  ]
  for (const obj of objectsToClear) {
    delete obj[instanceName]
  }
  store.set({
    composeData,
    currentInstance: newInstance,
    customEmoji,
    instanceInfos,
    instanceLists,
    instanceThemes,
    loggedInInstances,
    loggedInInstancesInOrder,
    queryInSearch: '',
    searchResults: null,
    timelineInitialized: false,
    timelinePreinitialized: false,
    verifyCredentials
  })
  store.clearTimelineDataForInstance(instanceName)
  store.clearAutosuggestDataForInstance(instanceName)
  store.save()
  const { virtualListStore } = await importVirtualListStore()
  virtualListStore.clearRealmByPrefix(currentInstance + '/') // TODO: this is a hacky way to clear the vlist cache
  toast.say(message)
  const { enableGrayscale } = store.get()
  switchToTheme(instanceThemes[newInstance], enableGrayscale)
  /* no await */ database.clearDatabaseForInstance(instanceName)
  goto('/settings/instances')
}

function setStoreVerifyCredentials (instanceName, thisVerifyCredentials) {
  const { verifyCredentials } = store.get()
  verifyCredentials[instanceName] = thisVerifyCredentials
  store.set({ verifyCredentials: verifyCredentials })
}

export async function updateVerifyCredentialsForInstance (instanceName) {
  const { loggedInInstances } = store.get()
  const accessToken = loggedInInstances[instanceName].access_token
  await cacheFirstUpdateAfter(
    () => getVerifyCredentials(instanceName, accessToken).catch(logOutOnUnauthorized(instanceName)),
    () => database.getInstanceVerifyCredentials(instanceName),
    verifyCredentials => database.setInstanceVerifyCredentials(instanceName, verifyCredentials),
    verifyCredentials => setStoreVerifyCredentials(instanceName, verifyCredentials)
  )
}

export async function updateVerifyCredentialsForCurrentInstance () {
  const { currentInstance } = store.get()
  await updateVerifyCredentialsForInstance(currentInstance)
}

export async function updateInstanceInfo (instanceName) {
  await cacheFirstUpdateAfter(
    () => getInstanceInfo(instanceName),
    () => database.getInstanceInfo(instanceName),
    info => database.setInstanceInfo(instanceName, info),
    info => {
      const { instanceInfos } = store.get()
      instanceInfos[instanceName] = info
      store.set({ instanceInfos: instanceInfos })
    }
  )
}

export function logOutOnUnauthorized (instanceName) {
  return async error => {
    if (error.message.startsWith('401:')) {
      await logOutOfInstance(instanceName, `The access token was revoked, logged out of ${instanceName}`)
    }

    throw error
  }
}

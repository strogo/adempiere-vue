import { login, logout, requestUserInfoFromSession, getSessionInfo, changeRole } from '@/api/user'
import {
  getToken,
  setToken,
  removeToken,
  getCurrentRole,
  setCurrentRole,
  removeCurrentRole,
  getCurrentOrganization,
  setCurrentOrganization,
  getCurrentWarehouse,
  setCurrentWarehouse,
  removeCurrentWarehouse,
  removeCurrentOrganization
} from '@/utils/auth'
import {
  getCountryDefinition,
  getOrganizationsList,
  getWarehousesList,
  listLanguages
} from '@/api/ADempiere/system-core'
import router, { resetRouter } from '@/router'
import { showMessage } from '@/utils/ADempiere/notification'
import { isEmptyValue } from '@/utils/ADempiere/valueUtils'
import { convertDateFormat } from '@/utils/ADempiere/valueFormat'
import language from '@/lang'

const state = {
  token: getToken(),
  name: '',
  userUuid: '',
  avatar: '',
  introduction: '',
  role: {}, // info current role
  rolesList: [],
  roles: [],
  organizationsList: [],
  organization: {},
  warehousesList: [],
  languagesList: [],
  warehouse: {},
  isSession: false,
  sessionInfo: {},
  country: {}
}

const mutations = {
  SET_TOKEN: (state, token) => {
    state.token = token
  },
  SET_INTRODUCTION: (state, introduction) => {
    state.introduction = introduction
  },
  SET_NAME: (state, name) => {
    state.name = name
  },
  SET_AVATAR: (state, avatar) => {
    state.avatar = avatar
  },
  SET_ROLES: (state, roles) => {
    state.roles = roles
  },
  SET_ROLES_LIST: (state, payload) => {
    state.rolesList = payload
  },
  SET_ORGANIZATIONS_LIST: (state, payload) => {
    state.organizationsList = payload
  },
  SET_ORGANIZATION: (state, organization) => {
    state.organization = organization
  },
  SET_WAREHOUSES_LIST: (state, payload) => {
    state.warehousesList = payload
  },
  SET_WAREHOUSE: (state, warehouse) => {
    state.warehouse = warehouse
  },
  SET_ROLE: (state, role) => {
    state.role = role
  },
  SET_USER_UUID: (state, payload) => {
    state.userUuid = payload
  },
  setIsSession(state, payload) {
    state.isSession = payload
  },
  setSessionInfo(state, payload) {
    state.sessionInfo = payload
  },
  setCountry(state, payload) {
    state.country = payload
  },
  setLanguagesList: (state, payload) => {
    state.languagesList = Object.freeze(payload.map(language => {
      const languageDefinition = {
        ...language,
        datePattern: convertDateFormat(language.datePattern),
        timePattern: convertDateFormat(language.timePattern)
      }
      return languageDefinition
    }))
  }
}

const actions = {
  getLanguagesFromServer({ commit }) {
    return new Promise(resolve => {
      listLanguages({ pageToke: undefined, pageSize: undefined })
        .then(languageResponse => {
          commit('setLanguagesList', languageResponse.languagesList)
          resolve(languageResponse.languagesList)
        })
        .catch(error => {
          console.warn(`Error getting Languages List: ${error.message}. Code: ${error.code}.`)
        })
    })
  },
  getCountryFormServer({ commit }, {
    id,
    uuid
  }) {
    return new Promise(resolve => {
      getCountryDefinition({
        id,
        uuid
      })
        .then(responseCountry => {
          commit('setCountry', responseCountry)

          resolve(responseCountry)
        })
        .catch(error => {
          console.warn(`Error getting Country Definition: ${error.message}. Code: ${error.code}.`)
        })
    })
  },
  // user login
  login({ commit }, {
    userName,
    password
  }) {
    return new Promise((resolve, reject) => {
      login({
        userName,
        password
      })
        .then(logInResponse => {
          const { uuid: token } = logInResponse

          commit('SET_TOKEN', token)
          setToken(token)

          resolve()
        })
        .catch(error => {
          reject(error)
        })
    })
  },
  // session info
  getSessionInfo({ commit, dispatch }, sessionUuid = null) {
    if (isEmptyValue(sessionUuid)) {
      sessionUuid = getToken()
    }

    return new Promise((resolve, reject) => {
      getSessionInfo(sessionUuid)
        .then(async responseGetInfo => {
          const { role } = responseGetInfo
          commit('setIsSession', true)
          commit('setSessionInfo', {
            id: responseGetInfo.id,
            uuid: responseGetInfo.uuid,
            name: responseGetInfo.name,
            processed: responseGetInfo.processed
          })

          const userInfo = responseGetInfo.userInfo
          commit('SET_NAME', responseGetInfo.name)
          commit('SET_INTRODUCTION', userInfo.description)
          commit('SET_USER_UUID', userInfo.uuid)

          // TODO: return 'Y' or 'N' string values as data type Booelan (4)
          // TODO: return #Date as long data type Date (5)
          responseGetInfo.defaultContextMap.set('#Date', new Date())
          // set multiple context
          dispatch('setMultiplePreference', {
            values: responseGetInfo.defaultContextMap
          }, {
            root: true
          })

          const sessionResponse = {
            name: responseGetInfo.name,
            defaultContext: responseGetInfo.defaultContextMap
          }

          commit('SET_ROLE', role)
          setCurrentRole(role.uuid)

          await dispatch('getOrganizationsList', role.uuid)
          resolve(sessionResponse)

          const countryId = parseInt(
            responseGetInfo.defaultContextMap.get('#C_Country_ID'),
            10
          )
          if (isEmptyValue(countryId)) {
            console.info('context session without Country ID')
          } else {
            // get country and currency
            dispatch('getCountryFormServer', {
              id: countryId
            })
          }

          dispatch('getUserInfoFromSession', sessionUuid)
            .catch(error => {
              console.warn(`Error ${error.code} getting user info value: ${error.message}.`)
              reject(error)
            })
        })
        .catch(error => {
          console.warn(`Error ${error.code} getting context session: ${error.message}.`)
          reject(error)
        })
    })
  },
  // get user info
  getUserInfoFromSession({ commit }, sessionUuid = null) {
    if (isEmptyValue(sessionUuid)) {
      sessionUuid = getToken()
    }
    return new Promise((resolve, reject) => {
      requestUserInfoFromSession(sessionUuid).then(responseGetInfo => {
        if (isEmptyValue(responseGetInfo)) {
          reject({
            code: 0,
            message: 'Verification failed, please Login again.'
          })
        }
        // roles must be a non-empty array
        if (isEmptyValue(responseGetInfo.rolesList)) {
          reject({
            code: 0,
            message: 'getInfo: roles must be a non-null array!'
          })
        }

        commit('SET_ROLES_LIST', responseGetInfo.rolesList)

        const rolesName = responseGetInfo.rolesList.map(roleItem => {
          return roleItem.name
        })
        commit('SET_ROLES', rolesName)

        if (isEmptyValue(state.role)) {
          const role = responseGetInfo.rolesList.find(itemRole => {
            return itemRole.uuid === getCurrentRole()
          })
          if (!isEmptyValue(role)) {
            commit('SET_ROLE', role)
          }
        }

        // TODO: Add support from ADempiere
        const avatar = 'https://avatars1.githubusercontent.com/u/1263359?s=200&v=4'
        commit('SET_AVATAR', avatar)

        resolve({
          ...responseGetInfo,
          avatar,
          roles: rolesName
        })
      }).catch(error => {
        reject(error)
      })
    })
  },
  // user logout
  logout({ commit, state, dispatch }) {
    const token = state.token
    return new Promise((resolve, reject) => {
      commit('SET_TOKEN', '')
      commit('SET_ROLES', [])
      removeToken()

      commit('setIsSession', false)
      dispatch('resetStateBusinessData', null, {
        root: true
      })
      dispatch('dictionaryResetCache', null, {
        root: true
      })

      // reset visited views and cached views
      // to fixed https://github.com/PanJiaChen/vue-element-admin/issues/2485
      dispatch('tagsView/delAllViews', null, { root: true })

      removeCurrentRole()
      resetRouter()
      logout(token).catch(error => {
        console.warn(error)
      }).finally(() => {
        resolve()
      })
    })
  },
  // remove token
  resetToken({ commit }) {
    return new Promise(resolve => {
      commit('SET_TOKEN', '')
      commit('SET_ROLES', [])
      removeToken()
      resolve()
    })
  },
  getOrganizationsList({ commit, dispatch }, roleUuid) {
    if (isEmptyValue(roleUuid)) {
      roleUuid = getCurrentRole()
    }
    return getOrganizationsList({ roleUuid })
      .then(response => {
        commit('SET_ORGANIZATIONS_LIST', response.organizationsList)
        let organization = response.organizationsList.find(item => {
          if (item.uuid === getCurrentOrganization()) {
            return item
          }
        })
        if (isEmptyValue(organization)) {
          organization = response.organizationsList[0]
        }
        if (isEmptyValue(organization)) {
          removeCurrentOrganization()
          organization = undefined
        } else {
          setCurrentOrganization(organization.uuid)
        }
        commit('SET_ORGANIZATION', organization)

        dispatch('getWarehousesList', organization.uuid)
      })
      .catch(error => {
        console.warn(`Error ${error.code} getting Organizations list: ${error.message}.`)
      })
  },
  changeOrganization({ commit, dispatch, getters }, {
    organizationUuid,
    organizationId,
    isCloseAllViews = true
  }) {
    setCurrentOrganization(organizationUuid)
    const organization = getters.getOrganizations.find(org => org.uuid === organizationUuid)
    commit('SET_ORGANIZATION', organization)

    dispatch('getWarehousesList', organizationUuid)

    // TODO: Check if there are no tagViews in the new routes to close them, and
    // if they exist, reload with the new route using name (uuid)
    const route = router.app._route
    const selectedTag = {
      fullPath: route.fullPath,
      hash: route.hash,
      matched: route.matched,
      meta: route.meta,
      name: route.name,
      params: route.params,
      path: route.path,
      query: route.query,
      title: route.meta.title
    }

    let actionToDispatch = 'tagsView/delOthersViews'
    if (isCloseAllViews) {
      actionToDispatch = 'tagsView/delAllViews'
    }
    dispatch(actionToDispatch, selectedTag, { root: true })

    resetRouter()
    dispatch('permission/generateRoutes', organizationId, {
      root: true
    })
      .then(response => {
        router.addRoutes(response)
      })
  },
  getWarehousesList({ commit }, organizationUuid) {
    if (isEmptyValue(organizationUuid)) {
      organizationUuid = getCurrentOrganization()
    }

    return getWarehousesList({
      organizationUuid
    })
      .then(response => {
        commit('SET_WAREHOUSES_LIST', response.warehousesList)

        let warehouse = response.warehousesList.find(item => item.uuid === getCurrentWarehouse())
        if (isEmptyValue(warehouse)) {
          warehouse = response.warehousesList[0]
        }
        if (isEmptyValue(warehouse)) {
          removeCurrentWarehouse()
          commit('SET_WAREHOUSE', undefined)
        } else {
          setCurrentWarehouse(warehouse.uuid)
          commit('SET_WAREHOUSE', warehouse)
        }
      })
      .catch(error => {
        console.warn(`Error ${error.code} getting Warehouses list: ${error.message}.`)
      })
  },
  changeWarehouse({ commit, state }, {
    warehouseUuid
  }) {
    setCurrentWarehouse(warehouseUuid)
    commit('SET_WAREHOUSE', state.warehousesList.find(warehouse => warehouse.uuid === warehouseUuid))
  },
  // dynamically modify permissions
  changeRole({ commit, dispatch }, {
    roleUuid,
    organizationUuid,
    warehouseUuid,
    isCloseAllViews = true
  }) {
    const route = router.app._route
    const selectedTag = {
      fullPath: route.fullPath,
      hash: route.hash,
      matched: route.matched,
      meta: route.meta,
      name: route.name,
      params: route.params,
      path: route.path,
      query: route.query,
      title: route.meta.title
    }

    let actionToDispatch = 'tagsView/delOthersViews'
    if (isCloseAllViews) {
      actionToDispatch = 'tagsView/delAllViews'
    }
    dispatch(actionToDispatch, selectedTag, { root: true })

    return changeRole({
      sessionUuid: getToken(),
      roleUuid,
      organizationUuid,
      warehouseUuid
    })
      .then(changeRoleResponse => {
        const { role } = changeRoleResponse

        commit('SET_ROLE', role)
        setCurrentRole(role.uuid)
        commit('SET_TOKEN', changeRoleResponse.uuid)
        setToken(changeRoleResponse.uuid)

        // Update user info and context associated with session
        dispatch('getSessionInfo', changeRoleResponse.uuid)

        dispatch('resetStateBusinessData', null, {
          root: true
        })
        dispatch('dictionaryResetCache', null, {
          root: true
        })

        showMessage({
          message: language.t('notifications.successChangeRole'),
          type: 'success'
        })
        return {
          ...role,
          sessionUuid: changeRoleResponse.uuid
        }
      })
      .catch(error => {
        showMessage({
          message: error.message,
          type: 'error'
        })
        console.warn(`Error change role: ${error.message}. Code: ${error.code}.`)
      })
      .finally(() => {
        resetRouter()
        dispatch('permission/generateRoutes', null, {
          root: true
        })
          .then(response => {
            router.addRoutes(response)
          })
      })
  }
}

const getters = {
  getCountry: (state) => {
    return state.country
  },
  getCurrency: (state) => {
    const currency = state.country.currency
    if (isEmptyValue(currency)) {
      return {
        stdPrecision: 2,
        iSOCode: 'USD'
      }
    }
    return currency
  },
  getCountryLanguage: (state) => {
    return state.country.language.replace('_', '-')
  },
  getLanguagesList: (state) => {
    return state.languagesList
  },
  getCurrentLanguageDefinition: (state) => {
    return state.languagesList.find(definition => definition.language === state.country.language)
  },
  getRoles: (state) => {
    return state.rolesList
  },
  getOrganizations: (state) => {
    return state.organizationsList
  },
  getWarehouses: (state) => {
    return state.warehousesList
  },
  // current role info
  getRole: (state) => {
    return state.role
  },
  getOrganization: (state) => {
    return state.organization
  },
  getWarehouse: (state) => {
    return state.warehouse
  },
  getIsSession: (state) => {
    return state.isSession
  },
  getUserUuid: (state) => {
    return state.userUuid
  },
  getIsPersonalLock: (state) => {
    return state.role.isPersonalLock
  }
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
}

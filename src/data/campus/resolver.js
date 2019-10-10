import {
  Campus as coreCampus,
  Utils
} from '@apollosproject/data-connector-rock'
import { resolverMerge } from '@apollosproject/server-core'
import { get } from 'lodash'
import moment from 'moment'
import { parseRockKeyValuePairs } from '../utils'

const { createImageUrlFromGuid } = Utils

/* 
* Rock will not alaways return the expanded Location object
*
* We get around this by checking to see if the location object is null
*
* If it's null, we know that Rock just didn't expand it, so we attempt to
*    get the location object a second time by using the getFromId query
*    which explicitly tells Rock to expand location
*/

const resolver = {
  Campus: {
    image: async ({ id }, args, { dataSources }) => {
      const { attributeValues } = await dataSources.Campus.getFromId(id)

      return ({
        uri: get(attributeValues, 'campusImage.value', null) ? createImageUrlFromGuid(attributeValues.featuredImage.value) : null,
      })
    },
    featuredImage: async ({ id }, args, { dataSources }) => {
      const { attributeValues } = await dataSources.Campus.getFromId(id)

      return ({
        uri: get(attributeValues, 'featuredImage.value', null) ? createImageUrlFromGuid(attributeValues.featuredImage.value) : null,
      })
    },
    serviceTimes: async ({ serviceTimes, attributeValues }, args, { dataSources }) => {
      const serviceSchedule = get(attributeValues, 'serviceSchedule.value', null)

      if (serviceSchedule && serviceSchedule !== '') {
        const schedule = await dataSources.Campus.getSchedule(serviceSchedule)
        const { friendlyScheduleText } = schedule
        const timesParsedFromHtml = friendlyScheduleText
          .match(/<li>(.*?)<\/li>/g)
          .map((n) => n.replace(/<\/?li>/g, ''))

        return timesParsedFromHtml.map((n) => {
          const m = moment(n)

          return {
            day: m.format('YYYY-MM-DD'),
            time: m.format('LT')
          }
        })
      }

      return parseRockKeyValuePairs(serviceTimes, 'day', 'time')
    },
  }
}

export default resolverMerge(resolver, coreCampus)

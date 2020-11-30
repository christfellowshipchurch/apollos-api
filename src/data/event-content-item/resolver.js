import { ContentItem as coreContentItem } from '@apollosproject/data-connector-rock';
import { get, flatten, uniq, uniqBy, first, filter } from 'lodash';
import moment from 'moment';
import momentTz from 'moment-timezone';

import { parseRockKeyValuePairs } from '../utils';
import sanitizeHtml from '../sanitize-html';
import { sharingResolver } from '../content-item/resolver';
import deprecatedResolvers from './deprecated-resolvers';

import campusSortOrder from '../campus/campus-sort-order'

const resolver = {
  EventContentItem: {
    ...coreContentItem.resolver.ContentItem,
    ...sharingResolver,
    ...deprecatedResolvers,
    htmlContent: ({ content }) => sanitizeHtml(content),
    sharing: (root, args, { dataSources: { ContentItem } }, { parentType }) => ({
      url: ContentItem.generateShareUrl(root, parentType),
      title: 'Share via ...',
      message: ContentItem.generateShareMessage(root),
    }),
    checkin: ({ id }, args, { dataSources: { CheckInable } }, { parentType }) =>
      CheckInable.getByContentItem(id),
    callsToAction: async ({ attributeValues }, args, { dataSources }) => {
      // Deprecated Content Channel Type
      const ctaValuePairs = parseRockKeyValuePairs(
        get(attributeValues, 'callsToAction.value', ''),
        'call',
        'action'
      );

      if (ctaValuePairs.length) return ctaValuePairs;

      // Get Matrix Items
      const { MatrixItem } = dataSources;
      const matrixGuid = get(attributeValues, 'actions.value', '');
      const matrixItems = await MatrixItem.getItemsFromId(matrixGuid);

      return matrixItems.map(({ attributeValues: matrixItemAttributeValues }) => ({
        call: get(matrixItemAttributeValues, 'title.value', ''),
        action: get(matrixItemAttributeValues, 'url.value', ''),
      }));
    },
    label: async ({ attributeValues }) => get(attributeValues, 'label.value', ''),
    eventGroupings: async (
      { attributeValues },
      args,
      { dataSources: { MatrixItem, Event, Schedule } }
    ) => {
      // Get Matrix Items
      const matrixGuid = get(attributeValues, 'schedules.value', '');
      let matrixItems = [];

      if (!matrixGuid || matrixGuid === '') return [];

      try {
        matrixItems = await MatrixItem.getItemsFromId(matrixGuid);
      } catch (e) {
        console.log({ e });
        return [];
      }

      /**
       * Matrix Items are structured in Rock as: { schedule, [filters] }
       * We need to invert that relationship to be: { filter: [schedules] }
       */
      const filterScheduleDictionary = {};
      matrixItems.forEach((item) => {
        const schedule = get(item, 'attributeValues.schedule.value', '');
        const filters = get(item, 'attributeValues.filters.value', '');

        if (schedule && schedule !== '' && filters && filters !== '') {
          filters.split(',').forEach((filter) => {
            if (filterScheduleDictionary[filter]) {
              filterScheduleDictionary[filter].push(schedule);
            } else {
              filterScheduleDictionary[filter] = [schedule];
            }
          });
        }
      });

      return Object.entries(filterScheduleDictionary).map(([name, schedules]) => {
        return {
          name,
          instances: async () => {
            const rockSchedules = await Schedule.getFromIds(schedules);
            const times = await Promise.all(
              rockSchedules.map((s) => Event.parseScheduleAsEvents(s))
            );

            return uniqBy(
              flatten(times).sort((a, b) => moment(a.start).diff(b.start)),
              'start'
            );
          },
        };
      })
      .sort((a, b) => {
        /**
         * If an order for a given name doesn't exist in our ordering file,
         * we just shoot it to the bottom of the list
         */
        const aOrder = get(campusSortOrder, `${a.name}`, 1000)
        const bOrder = get(campusSortOrder, `${b.name}`, 1000)

        if (aOrder - bOrder < 0) return -1
        if (aOrder - bOrder > 0) return 1

        return 0
      });
    },
    liveStream: ({ id, attributeValues }, args, { dataSources: { LiveStream } }) => {
      const attributeMatrixGuid = get(attributeValues, 'liveStreams.value')
      
      return LiveStream.byAttributeMatrixGuid(attributeMatrixGuid, { contentChannelItemId: id })
    }
  },
};

export default resolver;

import { Group as baseGroup } from '@apollosproject/data-connector-rock';
import { resolverMerge } from '@apollosproject/server-core';

const resolver = {
  Group: {
    title: ({ name }, args, { dataSources }) => name,
    summary: ({ description }, args, { dataSources }) => description,
    schedule: ({ scheduleId }, args, { dataSources }) =>
      dataSources.Group.getScheduleFromId(scheduleId),
  },
};

export default resolverMerge(resolver, baseGroup);

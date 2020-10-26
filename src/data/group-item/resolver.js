import { Group as baseGroup } from '@apollosproject/data-connector-rock';
import { resolverMerge, parseGlobalId, createGlobalId } from '@apollosproject/server-core';

const defaultResolvers = {
  id: ({ id }, args, context, { parentType }) =>
    createGlobalId(id, parentType.name),
  title: (root, args, { dataSources }) => dataSources.GroupItem.getTitle(root),
  summary: ({ description }, args, { dataSources }) => description,
  groupType: ({ groupTypeId }, args, { dataSources }) =>
    dataSources.GroupItem.getGroupTypeFromId(groupTypeId),
  groupResources: (root, args, { dataSources }) =>
    dataSources.GroupItem.getResources(root),
  coverImage: (root, args, { dataSources: { ContentItem } }) =>
    ContentItem.getCoverImage(root),
  avatars: ({ id }, args, { dataSources }) =>
    dataSources.GroupItem.getAvatars(id),
  members: ({ id }, args, { dataSources }) =>
    dataSources.GroupItem.getMembers(id),
  leaders: ({ id }, args, { dataSources }) =>
    dataSources.GroupItem.getLeaders(id),
  people: async ({ id }, args, { dataSources: { GroupItem } }) =>
    GroupItem.paginateMembersById({
      ...args,
      id
    }),
  chatChannelId: (root, args, { dataSources }) =>
    null, // Deprecated
}

const resolver = {
  GroupItem: {
    __resolveType: (root, { dataSources: { Group } }) =>
      Group.resolveType(root),
  },
  Group: {
    ...defaultResolvers,
    schedule: ({ scheduleId }, args, { dataSources }) =>
      dataSources.GroupItem.getScheduleFromId(scheduleId),
    phoneNumbers: ({ id }, args, { dataSources }) => {
      return dataSources.GroupItem.groupPhoneNumbers(id);
    },
    dateTime: ({ scheduleId }, args, { dataSources }) =>
      dataSources.GroupItem.getDateTimeFromId(scheduleId),
    videoCall: (root, args, { dataSources }) =>
      dataSources.GroupItem.getGroupVideoCallParams(root),
    parentVideoCall: (root, args, { dataSources }) =>
      dataSources.GroupItem.getGroupParentVideoCallParams(root),
    allowMessages: (root, args, { dataSources }) =>
      dataSources.GroupItem.allowMessages(root),
    checkin: ({ id }, args, { dataSources: { CheckInable } }) =>
      CheckInable.getFromId(id),
    streamChatChannel: ({ id }, args, { dataSources: { CheckInable } }) => {
      // TODO
      return null
    },
  },
  VolunteerGroup: {
    ...defaultResolvers,
    id: ({ id }, args, context, { parentType }) =>
      createGlobalId(id, parentType.name),
    checkin: ({ id }, args, { dataSources: { CheckInable } }) =>
      CheckInable.getFromId(id),
    streamChatChannel: ({ id }, args, { dataSources: { CheckInable } }) => {
      // TODO
      return null
    },
  },
  Mutation: {
    addMemberAttendance: async (root, { id }, { dataSources }) => {
      const globalId = parseGlobalId(id);
      try {
        return dataSources.Group.addMemberAttendance(globalId.id);
      } catch (e) {
        console.log({ e });
      }

      return null;
    },
  },
};

export default resolverMerge(resolver, baseGroup);

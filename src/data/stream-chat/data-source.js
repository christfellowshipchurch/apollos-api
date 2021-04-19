import ApollosConfig from '@apollosproject/config';
import { RESTDataSource } from 'apollo-datasource-rest';
import { createGlobalId, parseGlobalId } from '@apollosproject/server-core';
import { StreamChat as StreamChatClient } from 'stream-chat';
import { chunk, get } from 'lodash';
import { Utils } from '@apollosproject/data-connector-rock';

const { STREAM } = ApollosConfig;
const { CHAT_SECRET, CHAT_API_KEY } = STREAM;

// Define singleton instance of StreamChatClient
let chatClient;

if (CHAT_SECRET && CHAT_API_KEY && !chatClient) {
  chatClient = new StreamChatClient(CHAT_API_KEY, CHAT_SECRET, { region: 'us-east-1' });
} else {
  console.warn(
    'You are using the Stream Chat dataSource without Stream credentials. To avoid issues, add Stream Chat credentials to your config.yml or remove the Stream Chat dataSource'
  );
}

const CREATE_USERS_LIMIT = 100;
const QUERY_MEMBERS_LIMIT = 100;
const ADD_MEMBERS_LIMIT = 100;
const REMOVE_MEMBERS_LIMIT = 100;
const PROMOTE_MODERATORS_LIMIT = 100;
const DEMOTE_MODERATORS_LIMIT = 100;

export default class StreamChat extends RESTDataSource {
  channelType = {
    LIVESTREAM: 'livestream',
    MESSAGING: 'messaging',
    GROUP: 'group',
  };

  getFromId = (id) => {
    const { channelId, channelType } = JSON.parse(id);

    return {
      channelId,
      channelType,
    };
  };

  getStreamUserId(id) {
    const globalId = createGlobalId(id, 'AuthenticatedUser');
    return globalId.split(':')[1];
  }

  generateUserToken = (userId) => {
    // get or create user
    // return valid user token

    const streamUserId = this.getStreamUserId(userId);

    return chatClient.createToken(streamUserId);
  };

  currentUserIsLiveStreamModerator = async () => {
    const { Flag } = this.context.dataSources;
    const flagStatus = await Flag.currentUserCanUseFeature('LIVE_STREAM_CHAT_MODERATOR');

    return flagStatus === 'LIVE';
  };

  getChannel = ({ channelId, channelType = this.channelType.LIVESTREAM }) => {
    return chatClient.channel(channelType, channelId);
  };

  getStreamUser = (user) => {
    const imageId = get(user, 'photo.guid', '');
    let image = '';
    if (imageId) {
      image = Utils.createImageUrlFromGuid(imageId);
    }
    return {
      id: this.getStreamUserId(user.id),
      name: `${user.firstName} ${user.lastName}`,
      image,
    };
  };

  createStreamUsers = async ({ users }) => {
    let offset = 0;

    // Paginate through users according to Stream's max call limit
    do {
      let endIndex = offset + CREATE_USERS_LIMIT;
      const usersSubset = users.slice(offset, endIndex);

      await chatClient.upsertUsers(usersSubset);

      offset = offset + CREATE_USERS_LIMIT;
    } while (users.length > offset);
  };

  getChannel = async ({ channelId, channelType, options = {} }) => {
    // Find or create the channel
    const channel = chatClient.channel(channelType, channelId, options);
    channel.create();

    // If options contains a name, update the name
    // note : this is done this way in order to take into account updating existing channels as well as creating new channels
    if (options.name) {
      await channel.updatePartial({ set: { name: options.name } });
    }

    return channel;
  };

  getChannelMembers = async ({ channelId, channelType, filter = {} }) => {
    const channel = chatClient.channel(channelType, channelId);

    const channelMembers = [];
    let responseMembers;
    do {
      const channelMembersResponse = await channel.queryMembers(
        filter,
        {},
        { limit: QUERY_MEMBERS_LIMIT, offset: channelMembers.length }
      );
      responseMembers = channelMembersResponse.members;
      channelMembers.push(...responseMembers);
    } while (responseMembers.length === QUERY_MEMBERS_LIMIT);

    return channelMembers;
  };

  addMembers = async ({
    channelId,
    groupMembers,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const channel = chatClient.channel(channelType, channelId);
    const channelMembers = await this.getChannelMembers({ channelId, channelType });
    const channelMemberIds = channelMembers.map((channelMember) =>
      get(channelMember, 'user.id')
    );

    const newMembers = groupMembers.filter(
      (member) => !channelMemberIds.includes(member)
    );

    if (newMembers.length) {
      await Promise.all(
        chunk(newMembers, ADD_MEMBERS_LIMIT).map(async (chunkedMembers) => {
          await channel.addMembers(chunkedMembers);
        })
      );
    }
  };

  removeMembers = async ({
    channelId,
    groupMembers,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const channel = chatClient.channel(channelType, channelId);
    const channelMembers = await this.getChannelMembers({ channelId, channelType });
    const channelMemberIds = channelMembers.map((channelMember) =>
      get(channelMember, 'user.id')
    );

    const badMembers = channelMemberIds.filter(
      (channelMember) => !groupMembers.includes(channelMember)
    );

    if (badMembers.length) {
      await Promise.all(
        chunk(badMembers, REMOVE_MEMBERS_LIMIT).map(async (chunkedMembers) => {
          await channel.removeMembers(chunkedMembers);
        })
      );
    }
  };

  // Compare the group leaders to the channel moderators
  // Promote any member who is a group leader, but not a channel moderator
  // Demote any member who is a channel moderator, but not a group leader
  updateModerators = async ({
    channelId,
    groupLeaders,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const channel = chatClient.channel(channelType, channelId);
    const channelModerators = await this.getChannelMembers({
      channelId,
      channelType,
      filter: { is_moderator: true },
    });
    const channelModeratorIds = channelModerators.map((channelModerator) =>
      get(channelModerator, 'user.id')
    );

    // Promote any groupLeaders not in the channelModerators list
    const newModerators = groupLeaders.filter(
      (leader) => !channelModeratorIds.includes(leader)
    );

    if (newModerators.length) {
      await Promise.all(
        chunk(newModerators, PROMOTE_MODERATORS_LIMIT).map(async (chunkedModerators) => {
          await channel.addModerators(chunkedModerators);
        })
      );
    }

    // Demote any moderators not in the groupLeaders list
    const badModerators = channelModeratorIds.filter(
      (channelModerator) => !groupLeaders.includes(channelModerator)
    );

    if (badModerators.length) {
      await Promise.all(
        chunk(badModerators, DEMOTE_MODERATORS_LIMIT).map(async (chunkedModerators) => {
          await channel.demoteModerators(chunkedModerators);
        })
      );
    }
  };

  addModerator = async ({
    channelId,
    userId,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const streamUserId = this.getStreamUserId(userId);

    const channel = chatClient.channel(channelType, channelId);
    await channel.addModerators([streamUserId]);
  };

  removeModerator = async ({
    channelId,
    userId,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const streamUserId = this.getStreamUserId(userId);

    const channel = chatClient.channel(channelType, channelId);
    await channel.demoteModerators([streamUserId]);
  };

  handleNewMessage = async (data) => {
    const { Flag, OneSignal, Person } = this.context.dataSources;

    const sender = get(data, 'user', {});
    const channelId = get(data, 'channel_id');
    const channelType = get(data, 'channel_type');
    const content = get(data, 'message.text', '');
    const members = get(data, 'members', []);
    const memberIds = members
      .filter(({ user }) => !user.banned) // user isn't banned
      .filter(({ banned }) => !banned) // user isn't banned from the channel
      .filter(({ user }) => !user.shadow_banned) // user isn't shadow banned from the channel
      .map(({ user_id }) => user_id)
      .filter((id) => id !== sender.id);

    if (channelId && channelType) {
      const channel = await this.getChannel({ channelId, channelType });
      const mutedNotifications = get(channel, 'channel.muteNotifications', []);
      const mutedUsers =
        mutedNotifications && Array.isArray(mutedNotifications) ? mutedNotifications : [];

      const rockAliasIds = await Promise.all(
        memberIds
          .filter((id) => !mutedUsers.includes(id)) // user who doesn't have notifications disabled for this channel
          .map(async (id) => {
            const { id: rockPersonId } = parseGlobalId(`Person:${id}`);
            const featureStatus = await Flag.userCanUseFeature(
              'GROUP_CHAT',
              rockPersonId
            );

            if (featureStatus === 'LIVE') {
              const person = await Person.getFromId(rockPersonId);

              return get(person, 'primaryAliasId');
            }

            return null;
          })
      );

      if (rockAliasIds.length) {
        OneSignal.createNotification({
          toUserIds: rockAliasIds
            .filter((id) => !!id) // filter out invalid ids as a last check
            .map((id) => `${id}`), // OneSignal expects an array of string Ids
          content,
          heading: `💬 Message from ${sender.name}`,
          app_url: `christfellowship://c/ChatChannelSingle?streamChannelId=${channelId}&streamChannelType=${channelType}`,
        });
      }
    }
  };
}

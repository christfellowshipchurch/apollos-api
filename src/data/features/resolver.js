import { Feature as coreFeatures } from '@apollosproject/data-connector-rock';
import { resolverMerge, createGlobalId } from '@apollosproject/server-core';
import { get } from 'lodash';

const resolver = {
  ActionBarFeature: {
    id: ({ id }) => createGlobalId(id, 'ActionBarFeature'),
  },
  AvatarListFeature: {
    id: ({ id }) => createGlobalId(id, 'AvatarListFeature'),
  },
  LiveStreamListFeature: {
    id: ({ id }) => createGlobalId(id, 'LiveStreamListFeature'),
  },
  CardListItem: {
    labelText: ({ labelText }) => labelText,
    hasAction: (root, args, { dataSources: { ContentItem } }) => {
      const { __type } = root.relatedNode;

      if (__type.includes('ContentItem')) {
        return !!get(ContentItem.getVideos(root.relatedNode), '[0].sources[0]', null);
      }

      return false;
    },
  },
};

export default resolverMerge(resolver, coreFeatures);

import gql from 'graphql-tag';

export const groupSchema = gql`
  enum GROUP_TYPE {
    Serving
    Community
    Family
    Adult
    Freedom
  }

  type Group implements Node {
    id: ID!
    name: String
    leaders: [Person]
    members: [Person]
  }

  extend type Person {
    groups(type: GROUP_TYPE, asLeader: Boolean): [Group]
    isGroupLeader: Boolean
  }
`;

export default groupSchema;

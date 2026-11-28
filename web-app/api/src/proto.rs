pub mod tenant {
    pub mod v1 {
        #![allow(clippy::all)]
        include!(concat!(env!("OUT_DIR"), "/tenant.v1.rs"));
        include!(concat!(env!("OUT_DIR"), "/tenant.v1.serde.rs"));
    }
}

pub mod todo {
    pub mod v1 {
        #![allow(clippy::all)]
        include!(concat!(env!("OUT_DIR"), "/todo.v1.rs"));
        include!(concat!(env!("OUT_DIR"), "/todo.v1.serde.rs"));
    }
}

use chrono::{DateTime, Utc};
use pbjson_types::Timestamp;

pub fn datetime_to_proto_timestamp(dt: DateTime<Utc>) -> Timestamp {
    Timestamp {
        seconds: dt.timestamp(),
        nanos: dt.timestamp_subsec_nanos() as i32,
    }
}
